// Зазывалы входов: желейки-жители площади (только в браузере, сервер о них не знает). Стоят у своего входа, поворачиваются
// к подошедшему игроку, машут и время от времени говорят в облачке — по живому статусу режима («старт через 8 с»,
// «держат 3 защитника»). Табличка с именем — своя, без уровня. Вдали (дальше FAR) — не рисуются и не считаются.
import * as THREE from 'three';
import { ACT_NONE, ACT_WAVE } from '../../../shared/lobby.ts';
import { lerpAngle } from '../../../shared/math.ts';
import type { Outfit } from '../../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../../shared/protocol.ts';
import { Avatar, type AvatarPose, type GroundQuery } from '../../render/avatar.ts';
import type { ToutKey } from './data.ts';
import { canvasTexture, FONT, makeCanvas, roundRectPath } from './gfx.ts';

/** Дальше этого расстояния до камеры зазывала скрыт */
export const TOUT_FAR = 46;
/** Ближе этого — говорит и поворачивается к игроку */
export const TOUT_TALK = 15;
export const TOUT_WAVE = 6.5;

export type ToutArms = 'rest' | 'zombie' | 'megaphone' | 'hips';

export interface ToutDef {
  /** Кто это (по нему выбираются живые реплики) */
  key: ToutKey;
  /** Номер желейки (не пересекается с игроками: от 960) */
  id: number;
  /** Имя на табличке */
  name: string;
  /** Цвет точки на табличке */
  accent: string;
  x: number;
  z: number;
  y?: number;
  /** Куда смотрит в покое (0 → −Z, как взгляд игрока) */
  yaw: number;
  outfit: Outfit;
  arms?: ToutArms;
  /** Маркер пейнтбола в руках */
  gun?: boolean;
  /** Реплики по умолчанию; живые приходят в update */
  lines: readonly string[];
}

/** Курс из (x, z) на точку (tx, tz): yaw = 0 смотрит в −Z */
export function yawToward(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}

const ARMS: Record<ToutArms, readonly number[] | null> = {
  rest: null,
  // руки вперёд, как у зомби
  zombie: [-0.2, 0.98, -0.58, 0.2, 0.98, -0.58],
  // правая у рта, левая на поясе
  megaphone: [-0.4, 0.62, -0.08, 0.3, 1.18, -0.38],
  hips: [-0.46, 0.66, -0.06, 0.46, 0.66, -0.06],
};

function nameplate(name: string, accent: string): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(320, 64);
  ctx.font = `700 31px ${FONT}`;
  const w = Math.min(310, ctx.measureText(name).width + 62);
  const x = (320 - w) / 2;
  roundRectPath(ctx, x, 6, w, 52, 26);
  ctx.fillStyle = 'rgba(24,34,56,0.82)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(x + 25, 32, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x + 42, 34, w - 56);
  const t = canvasTexture(c);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

export class Tout {
  readonly av: Avatar;
  readonly def: ToutDef;
  private readonly pose: AvatarPose;
  private readonly tag: THREE.Sprite;
  private readonly arms: readonly number[] | null;
  private yaw: number;
  private sayT = 2 + Math.random() * 3;
  private line = 0;
  private waveT = 0;
  private waveCool = 0;
  private hidden = true;
  private readonly ground: GroundQuery;
  /** Расстояние до камеры в последнем кадре */
  dist = Infinity;

  constructor(scene: THREE.Scene, def: ToutDef, ground: GroundQuery) {
    this.ground = ground;
    this.def = def;
    this.yaw = def.yaw;
    this.av = new Avatar(def.id, { gun: def.gun === true, voice: false });
    this.av.setOutfit(def.outfit);
    this.av.setInfo('', null, false);
    this.av.addTo(scene);
    this.pose = { x: def.x, y: def.y ?? 0, z: def.z, yaw: def.yaw, pitch: 0, flags: E_ALIVE | E_GROUNDED };
    const arms = ARMS[def.arms ?? 'rest'];
    this.arms = arms;
    if (arms) this.av.hands = [...arms];
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameplate(def.name, def.accent), sizeAttenuation: false, depthWrite: false, transparent: true, fog: false }));
    this.tag.scale.set(0.16, 0.032, 1);
    this.tag.center.set(0.5, 0);
    this.tag.position.y = 1.86;
    this.tag.renderOrder = 5;
    this.av.root.add(this.tag);
    this.setHidden(true);
  }

  private setHidden(h: boolean): void {
    if (h === this.hidden) return;
    this.hidden = h;
    this.av.root.visible = !h;
    this.av.shadow.visible = !h;
    this.tag.visible = !h;
  }

  /**
   * Кадр. cam — камера, me — своя желейка (x, z) или null, lines — живые реплики (пусто — по умолчанию), on — вход работает
   * (режим включён): иначе зазывала прячется.
   */
  update(dt: number, time: number, cam: THREE.Vector3, me: { x: number; z: number } | null, lines: readonly string[], on: boolean): void {
    const d = Math.hypot(cam.x - this.def.x, cam.z - this.def.z);
    this.dist = d;
    if (!on || d > TOUT_FAR) {
      this.setHidden(true);
      return;
    }
    this.setHidden(false);
    const dm = me ? Math.hypot(me.x - this.def.x, me.z - this.def.z) : Infinity;
    // поворот к игроку — только пока он рядом; иначе — на свой пост
    const want = me && dm < 9 ? yawToward(this.def.x, this.def.z, me.x, me.z) : this.def.yaw;
    this.yaw = lerpAngle(this.yaw, want, Math.min(1, dt * 3.2));
    this.pose.yaw = this.yaw;
    // машет подошедшему (не чаще раза в 22 с); руки-«зомби» и рупор — не трогаем
    this.waveCool -= dt;
    if (this.waveT > 0) {
      this.waveT -= dt;
      if (this.waveT <= 0) this.av.setAction(ACT_NONE, 0);
    } else if (!this.arms && dm < TOUT_WAVE && this.waveCool <= 0) {
      this.waveT = 2.4;
      this.waveCool = 22;
      this.av.setAction(ACT_WAVE, 0);
    }
    // зомби и другие с руками на весу — покачиваются
    if (this.arms) {
      const h = this.av.hands!;
      const sw = Math.sin(time * 2.1 + this.def.id) * 0.05;
      for (let i = 0; i < 6; i += 3) {
        h[i] = this.arms[i];
        h[i + 1] = this.arms[i + 1] + (i === 0 ? sw : -sw);
        h[i + 2] = this.arms[i + 2];
      }
    }
    // реплика: пока кто-то рядом, раз в 9–13 с
    if (d < TOUT_TALK) {
      this.sayT -= dt;
      if (this.sayT <= 0) {
        const pool = lines.length ? lines : this.def.lines;
        if (pool.length) this.av.say(pool[this.line++ % pool.length]);
        this.sayT = 9 + Math.random() * 4;
      }
    } else {
      this.sayT = Math.min(this.sayT, 1.2);
    }
    this.av.update(this.pose, dt, time, this.ground, cam, false);
    const k = Math.min(1, Math.max(0, (34 - d) / 10));
    this.tag.material.opacity = k;
    this.tag.visible = k > 0.02;
  }
}

// Т-18 «Батуты на ход стены»: четыре отмеченных места во дворе (TRAMP_SPOTS). Не куплено — меловой круг на земле и
// полупрозрачный батут; в сборе и передышке подсказка «E — Батут · N золота». Куплено — настоящий батут набережной
// (render/kit.ts Trampolines: красный, жёлтый или синий обод, зелёная подложка), качается, когда на него прыгают; бокс в мире
// коллизий включает syncFortTramps (shared/fortmap.ts) по маске tramps. Подброс и кто купил решает сервер.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FT_BREAK, FT_GATHER } from '../../../shared/fort.ts';
import { NOPE_FAR, NOPE_GOLD } from '../../../shared/fortarsenal.ts';
import { TRAMP_SPOTS, USE_TRAMP, trampPrice } from '../../../shared/fortideas.ts';
import { syncFortTramps } from '../../../shared/fortmap.ts';
import { Trampolines } from '../../render/kit.ts';
import type { IdeasDeps } from './deps.ts';
import { nearTramp } from './logic.ts';

/** Размеры батута набережной (shared/maps/builder.ts trampoline) */
const R = 1.15;
const TOP = 0.42;
/** Обод по кругу: как на набережной */
const RIMS = [0xe5483b, 0xf2b330, 0x3f86c9];
const PAD = 0x4a9466;
/** Подложка и мел выше земли не меньше чем на 1,5 см — иначе издалека мерцают */
const LIFT = 0.02;

interface Live {
  tr: Trampolines;
  group: THREE.Object3D;
}

export class TrampsPart {
  private readonly d: IdeasDeps;
  private readonly live: Array<Live | null> = TRAMP_SPOTS.map(() => null);
  private ghost: THREE.Mesh[] = [];
  private readonly chalkMat = new THREE.MeshBasicMaterial({ color: 0xf4efe0, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, toneMapped: false });
  private readonly ghostMat = new THREE.MeshBasicMaterial({ color: 0xdfe9f2, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  private mask = 0;
  private maskKey = -1;
  private pendingAt = -9;
  private time = 0;
  /** Для чужих прыжков: откуда падал и когда последний раз пружинил (по игрокам) */
  private readonly watch = new Map<number, { y: number; fallAt: number; bounceAt: number }>();

  constructor(d: IdeasDeps) {
    this.d = d;
    syncFortTramps(d.collision, d.map, 0);
    this.set(0, true);
  }

  /** Маска купленных (бит на место): коллизия, настоящие батуты, призраки на пустых местах */
  set(mask: number, force = false): void {
    if (!force && mask === this.maskKey) return;
    this.maskKey = mask;
    this.mask = mask;
    syncFortTramps(this.d.collision, this.d.map, mask);
    TRAMP_SPOTS.forEach((s, i) => {
      const on = (mask & (1 << i)) !== 0;
      if (on && !this.live[i]) this.live[i] = this.build(i);
      const l = this.live[i];
      if (l) l.group.visible = on;
    });
    this.rebuildGhosts();
  }

  private build(i: number): Live {
    const scene = this.d.scene;
    const s = TRAMP_SPOTS[i];
    const before = new Set(scene.children);
    const tr = new Trampolines(scene, [{ x: s.x, z: s.z, top: TOP, r: R }], { rims: [RIMS[i % RIMS.length]], pads: [PAD] });
    const group = scene.children.find((c) => !before.has(c))!;
    // подложка и кайма (первые две плоскости) — на 2 см над землёй, а не на 7 мм
    group.children.slice(0, 2).forEach((c) => { c.position.y = LIFT; });
    return { tr, group };
  }

  /** Меловой круг и прозрачный батут на пустых местах: три плоскости на все четыре места, пересобираются при покупке */
  private rebuildGhosts(): void {
    for (const m of this.ghost) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.ghost = [];
    const ring: THREE.BufferGeometry[] = [];
    const body: THREE.BufferGeometry[] = [];
    TRAMP_SPOTS.forEach((s, i) => {
      if (this.mask & (1 << i)) return;
      ring.push(new THREE.RingGeometry(R + 0.3, R + 0.42, 48).rotateX(-Math.PI / 2).translate(s.x, LIFT, s.z));
      body.push(new THREE.TorusGeometry(R - 0.05, 0.11, 8, 36).rotateX(Math.PI / 2).translate(s.x, TOP, s.z));
      body.push(new THREE.CircleGeometry(R - 0.12, 32).rotateX(-Math.PI / 2).translate(s.x, TOP - 0.03, s.z));
    });
    for (const [parts, mat, order] of [[ring, this.chalkMat, 2], [body, this.ghostMat, 3]] as const) {
      if (!parts.length) continue;
      const geo = mergeGeometries(parts, false);
      parts.forEach((g) => g.dispose());
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      this.d.scene.add(mesh);
      this.ghost.push(mesh);
    }
  }

  // ------------------------------------------------------------ подсказка и покупка

  private get calm(): boolean {
    const p = this.d.phase();
    return p === FT_GATHER || p === FT_BREAK;
  }

  /** Подсказка у пустого места: [текст, цена, сработает ли E]; у купленного и вдали — null */
  hint(): [string, number, boolean] | null {
    const p = this.d.pos();
    const i = nearTramp(p.x, p.y, p.z);
    if (i < 0 || (this.mask & (1 << i)) !== 0) return null;
    // цену считает сервер от номера волны, который пришёл в fphase (в передышке — только что отбитая)
    const wave = Math.max(1, this.d.wave());
    if (!this.calm) return ['батут · покупка в передышке', 0, false];
    return ['батут · подбросит на стену', trampPrice(wave), true];
  }

  /** E у пустого места: купить. true — клавишу забрали */
  use(): boolean {
    const p = this.d.pos();
    const i = nearTramp(p.x, p.y, p.z);
    if (i < 0 || (this.mask & (1 << i)) !== 0 || !this.d.alive()) return false;
    if (!this.calm) {
      this.d.deny();
      return true;
    }
    if (this.time - this.pendingAt < 0.6) return true;
    this.pendingAt = this.time;
    this.d.send({ t: 'use', id: USE_TRAMP + i });
    return true;
  }

  // ------------------------------------------------------------ события и кадр

  /** ['tramp', spot, pid] — куплен; ['anope', pid, id, why] — отказ. true — наше */
  onEvent(e: readonly unknown[]): boolean {
    const { hud, sound, effects } = this.d;
    if (e[0] === 'tramp') {
      const spot = e[1] as number;
      const pid = e[2] as number;
      const s = TRAMP_SPOTS[spot];
      if (!s) return true;
      this.set(this.mask | (1 << spot));
      const me = pid === this.d.myId();
      hud.ui.push({ key: `tramp-${spot}`, icon: 'hammer', tone: 'good', title: me ? 'Батут куплен' : `${this.d.nameOf(pid)} поставил батут`, sub: 'прыгай — подбросит на стену', ms: 3200 });
      effects.puff(s.x, 0.4, s.z, 2.6, 0xe8dcc0, 0.7, 0.4, 0.55);
      effects.burst(s.x, 0.5, s.z, 0xffe08a, 12, 3, 0, 1, 0, 0.03);
      sound.hammer([s.x, 0.6, s.z], 3);
      this.live[spot]?.tr.bounce(s.x, s.z, 1);
      if (me) this.d.bought(false);
      return true;
    }
    if (e[0] === 'anope' && e[1] === this.d.myId() && typeof e[2] === 'number' && e[2] >= USE_TRAMP && e[2] < USE_TRAMP + TRAMP_SPOTS.length) {
      hud.ui.push({ key: 'tramp-no', icon: 'warn', tone: 'warn', ms: 2200,
        title: e[3] === NOPE_GOLD ? 'Не хватает золота' : e[3] === NOPE_FAR ? 'Подойди ближе к батуту' : 'Батут сейчас не купить' });
      this.d.deny();
      return true;
    }
    return false;
  }

  /** Свой прыжок на батут: качание и звон пружины */
  bounced(x: number, z: number): void {
    this.d.sound.trampoline(null);
    for (const l of this.live) l?.tr.bounce(x, z, 1.3);
  }

  /**
   * Кадр: качание; чужой прыжок — упал и тут же взлетел у купленного батута (как на набережной, lobby/scene.ts).
   * poses — позы остальных защитников.
   */
  frame(dt: number, poses: Iterable<[number, { x: number; y: number; z: number; valid: boolean }]>): void {
    this.time += dt;
    for (const l of this.live) if (l?.group.visible) l.tr.update(dt);
    if (!this.mask) return;
    for (const [id, p] of poses) {
      if (!p.valid) continue;
      let w = this.watch.get(id);
      if (!w) {
        w = { y: p.y, fallAt: -9, bounceAt: -9 };
        this.watch.set(id, w);
        continue;
      }
      const vy = dt > 0 ? (p.y - w.y) / dt : 0;
      w.y = p.y;
      if (vy < -3) w.fallAt = this.time;
      else if (vy > 3 && this.time - w.fallAt < 0.25 && this.time - w.bounceAt > 0.4) {
        for (let i = 0; i < TRAMP_SPOTS.length; i++) {
          const s = TRAMP_SPOTS[i];
          if ((this.mask & (1 << i)) === 0 || Math.hypot(p.x - s.x, p.z - s.z) > R + 0.4 || p.y > TOP + 1) continue;
          w.bounceAt = this.time;
          this.live[i]?.tr.bounce(s.x, s.z, 1.1);
          this.d.sound.trampoline([p.x, p.y, p.z]);
        }
      }
    }
  }

  dispose(): void {
    syncFortTramps(this.d.collision, this.d.map, 0);
    for (const m of this.ghost) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.ghost = [];
    this.chalkMat.dispose();
    this.ghostMat.dispose();
    for (const l of this.live) {
      if (!l) continue;
      l.group.removeFromParent();
      l.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
        }
      });
    }
    this.live.fill(null);
  }
}

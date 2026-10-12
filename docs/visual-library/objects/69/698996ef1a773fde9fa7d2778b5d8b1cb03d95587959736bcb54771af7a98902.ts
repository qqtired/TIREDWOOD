// «Набег пиратов» на набережной — сцена и ход события на экране. Сервер присылает три потока (server/lobby/pirates.ts):
// медленный вид `pirates` (фаза, прочность корабля, украдено), быстрое состояние `pnow` (пираты, шлюпки, добыча — 10 раз в
// секунду) и разовые эффекты `pfx` (выстрелы, попадания, всплески). Здесь: корабль «Весёлый Мармелад» по расписанию
// (shared/pirates.ts shipPose — одинаково у всех), шлюпки, береговые пушки, ящики и бочки, пираты-желейки толпой
// (PirateCrowd), эффекты (piratefx.ts), панель, прицел и стрелки (piratehud.ts), звук (только готовые методы Sound).
// Состояние дискретное берём из последнего пришедшего снимка, положения — интерполируем по тику отрисовки.
import * as THREE from 'three';
import { TICK_RATE, WATER_Y } from '../../shared/constants.ts';
import * as P from '../../shared/pirates.ts';
import type { Sound } from '../audio.ts';
import { MOB_STRIDE, type MobAnim } from '../fort/mobs/kit.ts';
import type { LobbyFx } from './fx.ts';
import {
  PF_BARREL, PF_CRATE, PK_CAPTAIN, PK_HAND, PS_CHEER, PS_FLEE, PS_GRAB, PS_IDLE, PS_JUMP, PS_ROW, PS_STUN,
  PirateCrowd, buildCannon, buildDinghy, buildLoot, buildShip, crowdRoot,
  type CannonModel, type DinghyModel, type LootKit, type PirateQuality, type ShipModel,
} from './piratemodels.ts';
import { PirateFx } from './piratefx.ts';
import { PirateHud, type ArrowSpec, type ReticleSpec } from './piratehud.ts';

export interface PirateHooks {
  sound: Sound;
  lobbyFx(): LobbyFx | null;
  /** Огонь (ЛКМ) нажат/отпущен кнопкой на экране телефона */
  fire(down: boolean): void;
  quality(): PirateQuality;
}
/** Я: опора ног, взгляд, номер в снимке, свободен ли для события */
export interface PirateMe { x: number; y: number; z: number; yaw: number; pitch: number; slot: number; pid: number }

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
}
/** Модели смотрят по +Z, курс игры — по −Z */
const FACE = Math.PI;
const PAINT_MIX = 0.38;

interface Snap { k: number; p: Map<number, P.PirateRow>; d: Map<number, P.DinghyRow> }
interface Track { id: number; seed: number; x: number; z: number; yaw: number; gait: number; st: number; since: number; flash: number; tint: number; px: number; pz: number; seen: number }
interface BoatView {
  id: number; model: DinghyModel; x: number; z: number; yaw: number; st: number; since: number; born: number; hit: number;
  stroke: number; speed: number; px: number; pz: number; cargo: number; sunkAt: number; seen: number; dead: boolean;
}
interface Ghost { kind: 'die' | 'dive'; seed: number; captain: boolean; x: number; z: number; yaw: number; tx: number; tz: number; t: number; dur: number; tint: number; boat: boolean }
interface Item { id: number; st: number; x: number; z: number; fx: number; fz: number; fxCur: number; fzCur: number; hopT: number; hopFrom: number; shown: boolean; popAt: number; spin: number }
interface CannonView { model: CannonModel; anim: { yaw: number; pitch: number; recoil: number; ready: number; t: number }; readyAt: number; fired: number; pop: number }
interface Mark { sprite: THREE.Sprite; kind: number }

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s1 = new THREE.Vector3();
const _p = new THREE.Vector3();
const SPRITE_H = 0.9;

/** Подпись-спрайт из канваса: текст белым с тёмной обводкой */
function textSprite(text: string, color = '#fff3de', scale = 1): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 72;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.font = '900 40px Rubik, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 9; ctx.strokeStyle = '#2a1206'; ctx.strokeText(text, 128, 38);
    ctx.fillStyle = color; ctx.fillText(text, 128, 38);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(2.6 * scale, 0.73 * scale, 1);
  return s;
}

/** Значок над головой: kind 0 — «!» на красном (вор несёт), 1 — жёлтая стрелка вниз (спаси ящик) */
function markTexture(kind: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 96;
  const ctx = c.getContext('2d');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (!ctx) return t;
  ctx.lineJoin = 'round';
  if (kind === 0) {
    ctx.fillStyle = '#e0283a'; ctx.strokeStyle = '#fff3de'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(48, 86); ctx.lineTo(8, 14); ctx.lineTo(88, 14); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.fillStyle = '#fff3de'; ctx.font = '900 46px Rubik, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 48, 40);
  } else {
    ctx.fillStyle = '#ffe066'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(48, 90); ctx.lineTo(10, 40); ctx.lineTo(34, 40); ctx.lineTo(34, 8); ctx.lineTo(62, 8); ctx.lineTo(62, 40); ctx.lineTo(86, 40); ctx.closePath(); ctx.stroke(); ctx.fill();
  }
  return t;
}

export class Pirates3D {
  readonly group = new THREE.Group();
  private readonly hooks: PirateHooks;
  private readonly hud: PirateHud;
  private readonly fx: PirateFx;
  private readonly crowd: PirateCrowd;
  private readonly kit: LootKit;
  private ship: ShipModel;
  private readonly shipAnim = { t: 0, speed: 0, anchored: 0, turn: 0, guns: [0, 0, 0, 0, 0, 0, 0, 0] as number[], damage: 0, flee: 0, whiteFlag: false };
  private readonly shipPose: P.ShipPose = { x: 0, z: 0, yaw: 0, speed: 0, anchored: 0, turn: 0, flee: 0 };
  private shipOn = false;
  private shipHit = 0;
  private readonly cannons: CannonView[] = [];
  private readonly cannonRings: THREE.Mesh[] = [];
  private readonly cannonLabels: THREE.Sprite[] = [];
  private readonly crates: THREE.InstancedMesh;
  private readonly barrels: THREE.InstancedMesh;
  private readonly marks: Mark[] = [];
  private readonly markMat: THREE.SpriteMaterial[];
  private view: P.PirateView = P.emptyPirates();
  private readonly snaps: Snap[] = [];
  private readonly tracks = new Map<number, Track>();
  private readonly boats = new Map<number, BoatView>();
  private readonly items = new Map<number, Item>();
  private readonly ghosts: Ghost[] = [];
  private readonly queue: Array<{ k: number; e: P.PirateFx }> = [];
  private readonly anim: MobAnim = { t: 0, gait: 0, speed: 0, st: 0, stT: 0, hit: 0, die: 0, seed: 0, rage: false, flags: 0, stage: 0 };
  private readonly root = new THREE.Matrix4();
  private readonly tint = new THREE.Color();
  private readonly shot = P.makeShot();
  private readonly aimBoats: P.AimBoat[] = [];
  private readonly arrows: ArrowSpec[] = [];
  private time = 0;
  private tick = 0;
  private lastId = '';
  private lastPhase: string = 'idle';
  private bells = 0;
  private bellAt = 0;
  private anchored = false;
  private myMarkerAt = -1e9;
  private me: PirateMe | null = null;
  private eligible = false;
  private nearCannon = -1;
  private nearLoot = false;
  private raidStart = 0;
  private _hint: { keys: string[]; text: string } | null = null;

  constructor(scene: THREE.Scene, root: HTMLElement, hooks: PirateHooks) {
    this.hooks = hooks;
    this.group.name = 'pirate-raid';
    this.group.visible = false;
    scene.add(this.group);
    this.kit = buildLoot();
    this.crowd = new PirateCrowd(this.group, hooks.quality());
    this.fx = new PirateFx(this.group, this.kit);
    this.ship = buildShip();
    this.ship.group.visible = false;
    this.group.add(this.ship.group);
    // добыча: ящики и бочки одним мешем на тип
    this.crates = new THREE.InstancedMesh(this.kit.crate, this.kit.material, P.PIRATE_LOOT);
    this.barrels = new THREE.InstancedMesh(this.kit.barrel, this.kit.material, P.PIRATE_LOOT);
    for (const m of [this.crates, this.barrels]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; this.group.add(m); }
    // пушки, кольца вокруг них и подписи
    const ringGeo = new THREE.RingGeometry(0.93, 1, 40).rotateX(-Math.PI / 2);
    for (let i = 0; i < P.PIRATE_CANNONS.length; i++) {
      const model = buildCannon();
      model.group.visible = false;
      this.group.add(model.group);
      this.cannons.push({ model, anim: { yaw: Math.PI, pitch: 0.12, recoil: 0, ready: 1, t: 0 }, readyAt: 0, fired: 0, pop: 0 });
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.set(P.PIRATE_CANNONS[i].x, 0.035, P.PIRATE_CANNONS[i].z);
      ring.scale.setScalar(P.PIRATE_CANNON_R);
      ring.visible = false; ring.renderOrder = 3;
      this.group.add(ring);
      this.cannonRings.push(ring);
      const label = textSprite('ПУШКА', '#ffe066', 0.8);
      label.position.set(P.PIRATE_CANNONS[i].x, 2.3, P.PIRATE_CANNONS[i].z);
      label.visible = false;
      this.group.add(label);
      this.cannonLabels.push(label);
    }
    // значки над ворами и ящиками на земле
    this.markMat = [0, 1].map(k => new THREE.SpriteMaterial({ map: markTexture(k), transparent: true, depthWrite: false }));
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(this.markMat[0]);
      s.visible = false; s.scale.set(SPRITE_H, SPRITE_H, 1);
      this.group.add(s);
      this.marks.push({ sprite: s, kind: 0 });
    }
    this.hud = new PirateHud(root, { fire: hooks.fire });
  }

  // ------------------------------------------------------------ входящие данные

  /** Медленный вид события */
  set(v: P.PirateView): void {
    this.view = v;
    if (v.id !== this.lastId) {
      this.lastId = v.id;
      if (v.phase === 'idle') this.clearAll();
    }
  }

  /** Быстрое состояние: пираты, шлюпки, вещи */
  snap(m: P.PirateSnapMsg): void {
    const s: Snap = { k: m.k, p: new Map(), d: new Map() };
    for (const r of m.p) s.p.set(r[0], r);
    for (const r of m.d) s.d.set(r[0], r);
    const last = this.snaps[this.snaps.length - 1];
    if (last && m.k < last.k) this.snaps.length = 0;
    this.snaps.push(s);
    if (this.snaps.length > 6) this.snaps.shift();
    if (m.l) this.applyLoot(m.l);
  }

  /** Разовые эффекты: в очередь по тику, проигрываем, когда дойдёт тик отрисовки */
  fxMsg(m: P.PirateFxMsg): void {
    for (const e of m.e) this.queue.push({ k: m.k, e });
  }

  /** Сцену сменили/вышли с набережной: убрать всё */
  reset(): void {
    this.view = P.emptyPirates();
    this.clearAll();
  }

  private clearAll(): void {
    this.snaps.length = 0; this.queue.length = 0; this.tracks.clear(); this.ghosts.length = 0;
    for (const b of this.boats.values()) b.model.dispose();
    this.boats.clear(); this.items.clear();
    this.fx.clear(); this.crowd.clear();
    this.shipOn = false; this.anchored = false; this.bells = 0; this.shipHit = 0;
    for (const c of this.cannons) { c.pop = 0; c.readyAt = 0; c.anim.recoil = 0; }
    this.crates.count = 0; this.barrels.count = 0;
    this.lastPhase = 'idle';
  }

  // ------------------------------------------------------------ чтение для сцены

  /** Подсказка внизу экрана: у пушки и первые секунды набега, рядом с брошенным ящиком */
  get hint(): { keys: string[]; text: string } | null { return this._hint; }
  /** Набег идёт и я в деле: плечевая камера, огонь */
  get raiding(): boolean { return this.eligible && this.view.phase === 'raid'; }
  get phase(): string { return this.view.phase; }
  /** Стою у береговой пушки (номер) или −1 */
  get cannonAt(): number { return this.nearCannon; }
  set mePid(v: number) { this.hud.mePid = v; }

  // ------------------------------------------------------------ кадр

  update(tick: number, dt: number, cam: THREE.PerspectiveCamera, me: PirateMe | null, eligible: boolean, touch: boolean): void {
    const v = this.view;
    this.tick = tick; this.time += dt; this.me = me; this.eligible = eligible && me !== null;
    const live = v.phase !== 'idle';
    this.group.visible = live;
    if (!live) {
      if (this.lastPhase !== 'idle') { this.lastPhase = 'idle'; this.clearAll(); }
      this.hud.update(v, tick, false, 0, touch);
      this.hud.reticle({ mode: 'off', slot: 0, text: '', state: 'none' }, dt);
      this.hud.setArrows([]);
      this._hint = null; this.nearCannon = -1;
      return;
    }
    if (v.phase !== this.lastPhase) this.onPhase(v.phase);
    this.lastPhase = v.phase;
    this.runQueue(tick);
    const cur = this.pickSnap(tick);
    this.updateShip(tick, dt);
    this.updateBoats(tick, dt, cur);
    this.updateCannons(tick, dt, cam.position);
    this.updateLoot(tick, dt);
    this.updatePirates(tick, dt, cur);
    this.updateMarks(tick);
    this.fx.update(tick, dt);
    this.updateDocks(tick);
    this.updateHud(tick, dt, cam, touch);
  }

  private onPhase(phase: string): void {
    const v = this.view;
    if (phase === 'warn') { this.bells = 3; this.bellAt = 0; this.myMarkerAt = -1e9; }
    if (phase === 'raid') this.raidStart = v.start;
    if (phase === 'end') {
      const fx = this.hooks.lobbyFx();
      if (v.win) {
        this.hooks.sound.fanfare(null);
        const at = _v.set(P.PIRATE_SHIP.x - 4, 14, 36);
        fx?.fireworks(at, 6);
        fx?.confetti(P.PIRATE_PILES[1].x, 4, P.PIRATE_PILES[1].z, 90, 0, 1, -0.2, 0.9, 7);
      } else this.hooks.sound.lobbyEvent('loss');
    }
  }

  // ------------------------------------------------------------ интерполяция

  /** Последний снимок не новее тика отрисовки (или самый ранний) */
  private pickSnap(tick: number): Snap | null {
    let cur: Snap | null = null;
    for (const s of this.snaps) if (s.k <= tick) cur = s;
    return cur ?? this.snaps[0] ?? null;
  }

  private next(cur: Snap): Snap | null {
    for (const s of this.snaps) if (s.k > cur.k) return s;
    return null;
  }

  private prev(cur: Snap): Snap | null {
    let p: Snap | null = null;
    for (const s of this.snaps) if (s.k < cur.k) p = s;
    return p;
  }

  /** Положение сущности по снимкам: вперёд к следующему, иначе экстраполяция по прошлому (не дальше 1,7 периода) */
  private sample<T extends readonly number[]>(cur: Snap, key: 'p' | 'd', id: number, tick: number, ix: number, iz: number, iy: number, out: { x: number; z: number; yaw: number }): boolean {
    const a = cur[key].get(id) as T | undefined;
    if (!a) return false;
    const nxt = this.next(cur);
    const b = nxt?.[key].get(id) as T | undefined;
    if (nxt && b && nxt.k > cur.k) {
      const u = clamp01((tick - cur.k) / (nxt.k - cur.k));
      out.x = lerp(a[ix], b[ix], u); out.z = lerp(a[iz], b[iz], u); out.yaw = lerpAngle(a[iy], b[iy], u);
      return true;
    }
    const pv = this.prev(cur);
    const o = pv?.[key].get(id) as T | undefined;
    if (pv && o) {
      const u = Math.min(1.7, (tick - cur.k) / Math.max(1, cur.k - pv.k));
      out.x = a[ix] + (a[ix] - o[ix]) * u; out.z = a[iz] + (a[iz] - o[iz]) * u; out.yaw = a[iy];
      return true;
    }
    out.x = a[ix]; out.z = a[iz]; out.yaw = a[iy];
    return true;
  }

  // ------------------------------------------------------------ корабль

  private updateShip(tick: number, dt: number): void {
    const v = this.view, a = this.shipAnim, ps = this.shipPose;
    const on = P.shipPose(v, tick, ps);
    this.ship.group.visible = on;
    if (!on) { this.shipOn = false; return; }
    if (!this.shipOn) { this.shipOn = true; this.anchored = false; }
    this.ship.group.position.set(ps.x, WATER_Y, ps.z);
    this.ship.group.rotation.set(0, ps.yaw + FACE, 0);
    this.ship.group.updateMatrixWorld(true);
    a.t = this.time; a.speed = ps.speed; a.anchored = ps.anchored; a.turn = ps.turn; a.flee = ps.flee;
    a.damage = v.hpMax > 0 ? clamp01(1 - v.hp / v.hpMax) + this.shipHit * 0.04 : 0;
    a.whiteFlag = v.phase === 'end' && v.win;
    for (let i = 0; i < 8; i++) a.guns[i] = Math.max(0, a.guns[i] - dt * 2.2);
    this.shipHit = Math.max(0, this.shipHit - dt);
    this.ship.update(a, dt);
    // якорь отдан: гудок и всплеск
    if (ps.anchored >= 1 && !this.anchored) {
      this.anchored = true;
      this.hooks.sound.lobbyEvent('horn', [ps.x, 3, ps.z]);
      this.fx.splash(ps.x - 6.4, ps.z + 2.2, false); // якорь падает с кат-балки со стороны моря
    }
    // дым от повреждений
    if (v.hpMax > 0 && v.hp * 2 <= v.hpMax && Math.random() < dt * 5) {
      const sp = this.ship.smokeSpots[Math.floor(Math.random() * this.ship.smokeSpots.length)];
      if (sp) { _v.set(sp.x, sp.y, sp.z); this.ship.hull.localToWorld(_v); this.fx.puff(_v.x, _v.y, _v.z, 1, 0.8, true); }
    }
    // колокол трижды в начале анонса
    if (this.bells > 0 && performance.now() >= this.bellAt) {
      this.bells--; this.bellAt = performance.now() + 1700;
      this.hooks.sound.bell(null);
    }
  }

  /** Мировая точка и направление дула пушки корабля i (0…3 — к набережной, правый борт) */
  private shipMuzzle(i: number, pos: THREE.Vector3, dir: THREE.Vector3): boolean {
    const m = this.ship.muzzles[4 + (i & 3)] ?? this.ship.muzzles[0];
    if (!m) return false;
    this.ship.group.updateMatrixWorld(true);
    pos.set(m.x, m.y, m.z);
    this.ship.hull.localToWorld(pos);
    dir.set(m.x + m.dx, m.y, m.z + m.dz);
    this.ship.hull.localToWorld(dir);
    dir.sub(pos).normalize();
    return true;
  }

  // ------------------------------------------------------------ шлюпки

  private updateBoats(tick: number, dt: number, cur: Snap | null): void {
    const out = { x: 0, z: 0, yaw: 0 };
    const seenNow = new Set<number>();
    if (cur) for (const [id, r] of cur.d) {
      let b = this.boats.get(id);
      if (!b) {
        b = { id, model: buildDinghy(), x: r[1], z: r[2], yaw: r[3], st: r[4], since: tick, born: tick, hit: 0, stroke: 0, speed: 0, px: r[1], pz: r[2], cargo: 0, sunkAt: 0, seen: tick, dead: false };
        b.model.group.visible = false;
        this.group.add(b.model.group);
        this.boats.set(id, b);
      }
      seenNow.add(id);
      b.seen = tick;
      if (b.st !== r[4]) { b.st = r[4]; b.since = tick; if (r[4] === P.DS_SUNK && !b.sunkAt) b.sunkAt = tick; }
      b.cargo = r[5];
      if (this.sample(cur, 'd', id, tick, 1, 2, 3, out)) { b.px = b.x; b.pz = b.z; b.x = out.x; b.z = out.z; b.yaw = out.yaw; }
    }
    for (const [id, b] of this.boats) {
      const gone = !seenNow.has(id) && !b.dead;
      if (gone && !(b.st === P.DS_SUNK && tick - b.sunkAt < 200)) { b.model.dispose(); this.boats.delete(id); continue; }
      const age = (tick - b.born) / TICK_RATE;
      // спуск с борта на шлюпбалке: первые 1,4 с летит с борта к воде
      const lower = clamp01((tick - b.born) / (1.4 * TICK_RATE));
      let y = WATER_Y;
      let x = b.x, z = b.z;
      if (lower < 1 && b.st === P.DS_IN) {
        const dv = this.ship.davits[1] ?? this.ship.davits[0];
        if (dv) {
          _v.set(dv.x, dv.y, dv.z);
          this.ship.hull.localToWorld(_v);
          const e = lower * lower * (3 - 2 * lower);
          x = lerp(_v.x, b.x, e); z = lerp(_v.z, b.z, e); y = lerp(_v.y, WATER_Y, e);
        }
      }
      const sp = Math.hypot(b.x - b.px, b.z - b.pz) / Math.max(dt, 1e-3);
      b.speed = lerp(b.speed, Math.min(5, sp), clamp01(dt * 6));
      b.stroke = (b.stroke + b.speed * dt / 2.4) % 1;
      b.hit = Math.max(0, b.hit - dt * 3);
      b.model.group.visible = true;
      b.model.group.position.set(x, y, z);
      b.model.group.rotation.set(0, b.yaw + FACE, 0);
      b.model.group.updateMatrixWorld(true);
      const sunk = b.st === P.DS_SUNK ? clamp01((tick - b.sunkAt) / (3 * TICK_RATE)) : 0;
      b.model.update({ t: this.time + id, speed: b.speed, stroke: b.stroke, oars: b.st === P.DS_SUNK ? 2 : b.st === P.DS_MOOR || b.st === P.DS_DOCK ? 1 : 0, cargo: b.cargo, sink: sunk, hit: b.hit }, dt);
      void age;
    }
  }

  // ------------------------------------------------------------ пушки

  private updateCannons(tick: number, dt: number, camPos: THREE.Vector3): void {
    const v = this.view;
    const out = tick >= v.t0 + P.PIRATE_GUNS_AT && v.phase !== 'idle';
    const retract = v.phase === 'end' ? clamp01((v.end - tick) / TICK_RATE) : 1;
    this.nearCannon = -1;
    const me = this.eligible ? this.me : null;
    if (me && v.phase === 'raid' && Math.abs(me.y) < 1.4) {
      let best = P.PIRATE_CANNON_R;
      for (let i = 0; i < this.cannons.length; i++) {
        const d = Math.hypot(me.x - P.PIRATE_CANNONS[i].x, me.z - P.PIRATE_CANNONS[i].z);
        if (d <= best) { best = d; this.nearCannon = i; }
      }
    }
    for (let i = 0; i < this.cannons.length; i++) {
      const c = this.cannons[i], pos = P.PIRATE_CANNONS[i];
      c.pop = out ? Math.min(1, c.pop + dt / 0.7) : Math.max(0, c.pop - dt / 0.5);
      const e = c.pop * retract;
      c.model.group.visible = e > 0.001;
      // выкатили: вырастает с пружинкой
      const s = e >= 1 ? 1 : e * (1 + 0.28 * Math.sin(e * Math.PI));
      c.model.group.position.set(pos.x, 0, pos.z);
      c.model.group.scale.setScalar(Math.max(0.001, s));
      c.anim.t = this.time;
      c.anim.recoil = Math.max(0, c.anim.recoil - dt * 2.4);
      c.anim.ready = v.phase === 'raid' ? clamp01(1 - (c.readyAt - tick) / P.PIRATE_CANNON_CD) : 1;
      // стою у пушки — ствол за прицелом
      if (this.nearCannon === i && this.me && this.shot.ok !== undefined) {
        const f = this.shot;
        const want = Math.atan2(-(f.x - pos.x), -(f.z - pos.z));
        c.anim.yaw = lerpAngle(c.anim.yaw, f.ok || f.kind !== P.SK_WATER ? want : Math.PI, clamp01(dt * 10));
        const dist = Math.hypot(f.x - pos.x, f.z - pos.z);
        c.anim.pitch = lerp(c.anim.pitch, Math.min(0.6, Math.max(0.05, Math.atan2(4 * P.shellApex(dist), Math.max(4, dist)))), clamp01(dt * 8));
      }
      c.model.update(c.anim, dt);
      const ring = this.cannonRings[i], label = this.cannonLabels[i];
      const showRing = e >= 1 && (v.phase === 'raid' || v.phase === 'warn') && this.eligible;
      ring.visible = showRing;
      if (showRing) {
        const ready = tick >= c.readyAt;
        (ring.material as THREE.MeshBasicMaterial).color.setHex(this.nearCannon === i ? (ready ? 0x7bd88f : 0xffb36b) : ready ? 0xffe066 : 0xb08a5a);
        (ring.material as THREE.MeshBasicMaterial).opacity = this.nearCannon === i ? 0.9 : 0.4 + 0.2 * Math.sin(this.time * 3 + i);
      }
      const near = me ? Math.hypot(me.x - pos.x, me.z - pos.z) : 99;
      label.visible = showRing && near < 16 && this.nearCannon !== i;
      if (label.visible) {
        label.position.y = 2.3 + 0.08 * Math.sin(this.time * 2 + i);
        // камера за спиной проходит вплотную к надписи — гаснет, а не закрывает пол-экрана огромным «ПУШКА»
        const dc = camPos.distanceTo(label.position);
        (label.material as THREE.SpriteMaterial).opacity = Math.min(1, Math.max(0, (dc - 2) / 3));
      }
    }
  }

  // ------------------------------------------------------------ добыча

  private applyLoot(rows: readonly P.LootRow[]): void {
    for (const r of rows) {
      let it = this.items.get(r[0]);
      const x = r[2], z = r[3];
      if (!it) {
        it = { id: r[0], st: r[1], x, z, fx: x, fz: z, fxCur: x, fzCur: z, hopT: 1, hopFrom: 0, shown: false, popAt: 0, spin: ((r[0] * 2.399) % TAU) };
        this.items.set(r[0], it);
      } else if (it.st !== r[1] || (r[1] !== P.LS_BOAT && r[1] !== P.LS_CARRIED && (Math.abs(it.x - x) > 0.05 || Math.abs(it.z - z) > 0.05))) {
        // перешла: прыжок дугой оттуда, где была нарисована, туда, где теперь
        if (r[1] === P.LS_PILE || r[1] === P.LS_DROPPED) { it.hopT = 0; it.hopFrom = it.shown ? 1 : 0; it.fx = it.fxCur; it.fz = it.fzCur; }
        it.st = r[1]; it.x = x; it.z = z;
      }
    }
  }

  private updateLoot(tick: number, dt: number): void {
    const v = this.view;
    const visible = tick >= v.t0 + P.PIRATE_LOOT_AT;
    let nc = 0, nb = 0;
    this.nearLoot = false;
    for (const it of this.items.values()) {
      const onQuay = it.st === P.LS_PILE || it.st === P.LS_DROPPED;
      if (!visible || !onQuay) { it.shown = false; it.fxCur = it.x; it.fzCur = it.z; continue; }
      if (!it.shown) { it.shown = true; it.popAt = this.time + (it.id % 4) * 0.12; if (it.hopT >= 1) { it.fxCur = it.x; it.fzCur = it.z; } }
      let x = it.x, z = it.z, y = 0;
      if (it.hopT < 1) {
        // прыжок дугой: из it.fx/fz к цели
        it.hopT = Math.min(1, it.hopT + dt / 0.55);
        const e = it.hopT;
        const dist = Math.hypot(it.x - it.fx, it.z - it.fz);
        x = lerp(it.fx, it.x, e); z = lerp(it.fz, it.z, e);
        y = Math.sin(e * Math.PI) * Math.min(2.2, 0.5 + dist * 0.12);
        if (e >= 1) this.fx.ring(it.x, 0.05, it.z, 0xffe066, 0.9, 0.3, 0.2);
      }
      it.fxCur = x; it.fzCur = z;
      // появление: выпрыгивает из ниоткуда
      const pop = clamp01((this.time - it.popAt) / 0.4);
      const sc = pop >= 1 ? 1 : pop * (1 + 0.35 * Math.sin(pop * Math.PI));
      if (pop < 1) y += (1 - pop) * 1.2;
      const mesh = P.lootIsBarrel(it.id) ? this.barrels : this.crates;
      _q.setFromEuler(_e.set(0, it.spin + (it.st === P.LS_DROPPED ? 0.5 : 0), it.st === P.LS_DROPPED ? 0.18 : 0));
      _m.compose(_p.set(x, y, z), _q, _s1.setScalar(Math.max(0.001, sc)));
      mesh.setMatrixAt(P.lootIsBarrel(it.id) ? nb++ : nc++, _m);
      if (it.st === P.LS_DROPPED && this.me && Math.hypot(this.me.x - it.x, this.me.z - it.z) < 7) this.nearLoot = true;
    }
    this.crates.count = nc; this.barrels.count = nb;
    this.crates.instanceMatrix.needsUpdate = true; this.barrels.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ пираты

  private trackOf(id: number, tick: number, r: P.PirateRow, x: number, z: number): Track {
    let t = this.tracks.get(id);
    if (!t) {
      t = { id, seed: (id * 0.61803398875) % 1, x, z, yaw: r[3], gait: 0, st: r[4], since: tick, flash: 0, tint: -1, px: x, pz: z, seen: tick };
      this.tracks.set(id, t);
    }
    return t;
  }

  private updatePirates(tick: number, dt: number, cur: Snap | null): void {
    const crowd = this.crowd, a = this.anim;
    crowd.begin();
    const out = { x: 0, z: 0, yaw: 0 };
    const seen = new Set<number>();
    if (cur) for (const [id, r] of cur.p) {
      const flags = r[6], aboard = (flags & P.PL_ABOARD) !== 0;
      let x = r[1], z = r[2];
      if (!aboard && this.sample(cur, 'p', id, tick, 1, 2, 3, out)) { x = out.x; z = out.z; }
      const t = this.trackOf(id, tick, r, x, z);
      seen.add(id);
      t.seen = tick;
      if (t.st !== r[4]) { t.st = r[4]; t.since = tick; }
      const sinceS = Math.max(0, (tick - t.since) / TICK_RATE);
      const captain = (flags & P.PL_CAPTAIN) !== 0;
      // шаг по пройденному пути
      const moved = Math.hypot(x - t.x, z - t.z);
      const speed = dt > 0 ? Math.min(6, moved / dt) : 0;
      if (!aboard && moved < 1.5) t.gait = (t.gait + moved / MOB_STRIDE) % 1;
      t.px = t.x; t.pz = t.z; t.x = x; t.z = z;
      if (!aboard) t.yaw = lerpAngle(t.yaw, r[3], clamp01(dt * 14));
      t.flash = Math.max(0, t.flash - dt * 2.8);
      a.t = this.time + t.seed * 7; a.gait = t.gait; a.speed = speed; a.st = r[4]; a.seed = t.seed; a.rage = (flags & P.PL_RAGE) !== 0; a.die = 0; a.hit = t.flash; a.stage = 0;
      a.flags = (flags & P.PL_CRATE ? PF_CRATE : 0) | (flags & P.PL_BARREL ? PF_BARREL : 0);
      a.stT = r[4] === PS_JUMP ? clamp01(sinceS / 0.5) : sinceS;
      if (r[4] === PS_GRAB) a.stT = sinceS;
      if (aboard) {
        const boat = this.boats.get(x | 0);
        if (!boat) continue;
        if (r[4] === PS_ROW) a.gait = boat.stroke;
        boat.model.seatRoot(Math.max(0, Math.min(2, z | 0)), this.root);
        a.speed = 0;
      } else {
        let y = 0;
        if (r[4] === PS_JUMP) y = 0.9 * Math.sin(clamp01(sinceS / 0.5) * Math.PI);
        crowdRoot(this.root, x, y, z, t.yaw);
      }
      // цвет: краска стрелка (стойкая) или румянец ярости у капитана
      let tint: THREE.Color | null = null, mix = PAINT_MIX;
      if (t.tint >= 0) { this.tint.setHex(t.tint); tint = this.tint; }
      else if (a.rage) { this.tint.setHex(0xff6a4a); tint = this.tint; mix = 0.25; }
      crowd.add(captain ? PK_CAPTAIN : PK_HAND, t.seed, this.root, a, t.flash, tint, mix);
    }
    for (const [id, t] of this.tracks) if (!seen.has(id) && tick - t.seen > 30) this.tracks.delete(id);
    // матросы-болельщики на палубе: поднимают руки, пока корабль стоит на рейде
    this.deckFans(tick);
    // растекаются лужей / ныряют
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t += dt;
      if (g.t >= g.dur) {
        if (g.kind === 'dive') this.fx.splash(g.tx, g.tz, false);
        this.ghosts.splice(i, 1);
        continue;
      }
      const u = g.t / g.dur;
      a.t = this.time; a.gait = 0; a.speed = 0; a.seed = g.seed; a.rage = false; a.flags = 0; a.stage = 0; a.hit = 0;
      if (g.kind === 'die') {
        a.st = PS_STUN; a.stT = 1; a.die = u;
        crowdRoot(this.root, g.x, 0, g.z, g.yaw);
        this.tint.setHex(g.tint);
        crowd.add(g.captain ? PK_CAPTAIN : PK_HAND, g.seed, this.root, a, 0, this.tint, 0.7);
      } else {
        a.st = PS_JUMP; a.stT = u; a.die = 0;
        crowdRoot(this.root, lerp(g.x, g.tx, u), (1 - (2 * u - 1) * (2 * u - 1)) * 1.2 - (u > 0.85 ? (u - 0.85) * 4 : 0), lerp(g.z, g.tz, u), g.yaw);
        crowd.add(g.captain ? PK_CAPTAIN : PK_HAND, g.seed, this.root, a, 0, null, 0);
      }
    }
    crowd.end();
  }

  private deckFans(tick: number): void {
    const ps = this.shipPose, v = this.view, a = this.anim;
    if (!this.shipOn || ps.flee > 0.5 && !(v.phase === 'end')) { /* уходит: болельщиков оставляем */ }
    if (!this.shipOn) return;
    const n = Math.min(this.ship.deck.length, 7);
    for (let i = 0; i < n; i++) {
      const seed = (i * 0.37 + 0.11) % 1;
      this.ship.deckRoot(i, this.root);
      a.t = this.time + i; a.gait = 0; a.speed = 0; a.seed = seed; a.rage = false; a.flags = 0; a.stage = 0; a.die = 0; a.hit = 0; a.stT = 0;
      a.st = v.phase === 'end' ? (v.win ? PS_FLEE : PS_CHEER) : i % 2 === 0 && v.phase === 'raid' ? PS_CHEER : PS_IDLE;
      this.crowd.add(PK_HAND, seed, this.root, a, 0, null, 0);
    }
    void tick;
  }

  // ------------------------------------------------------------ значки и кольца

  private updateMarks(tick: number): void {
    const v = this.view;
    let n = 0;
    const bob = Math.sin(this.time * 5) * 0.12;
    if (v.phase === 'raid') {
      for (const t of this.tracks.values()) {
        if (n >= this.marks.length) break;
        const r = this.snaps[this.snaps.length - 1]?.p.get(t.id);
        if (!r || (r[6] & P.PL_ABOARD) || r[7] < 0) continue;
        this.setMark(n++, 0, t.x, 2.6 + bob, t.z);
      }
      for (const it of this.items.values()) {
        if (n >= this.marks.length) break;
        if (it.st !== P.LS_DROPPED || !it.shown) continue;
        this.setMark(n++, 1, it.fxCur ?? it.x, 1.4 + bob * 1.4, it.fzCur ?? it.z);
      }
    }
    for (let i = n; i < this.marks.length; i++) this.marks[i].sprite.visible = false;
    void tick;
  }

  private setMark(i: number, kind: number, x: number, y: number, z: number): void {
    const m = this.marks[i];
    if (m.kind !== kind) { m.kind = kind; m.sprite.material = this.markMat[kind]; }
    m.sprite.visible = true;
    m.sprite.position.set(x, y, z);
  }

  private updateDocks(tick: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    const on = [false, false, false];
    for (const b of this.boats.values()) if ((b.st === P.DS_IN && tick - b.born > 60) || b.st === P.DS_MOOR) on[this.dockOf(b)] = true;
    for (let i = 0; i < on.length; i++) this.fx.dock(i, on[i] && this.view.phase === 'raid', pulse);
  }

  /** К какому причалу идёт шлюпка: по ближайшему x выхода */
  private dockOf(b: BoatView): number {
    let best = 0, d = Infinity;
    for (let i = 0; i < P.PIRATE_DOCKS.length; i++) {
      const dd = Math.abs(P.PIRATE_DOCKS[i].x - b.x) + Math.abs(P.PIRATE_ROUTES[i].pts[P.PIRATE_ROUTES[i].pts.length - 4] - b.x) * 0.2;
      if (dd < d) { d = dd; best = i; }
    }
    return best;
  }

  // ------------------------------------------------------------ панель, прицел, стрелки

  private updateHud(tick: number, dt: number, cam: THREE.PerspectiveCamera, touch: boolean): void {
    const v = this.view, hud = this.hud, me = this.me;
    let transit = 0;
    for (const it of this.items.values()) if (it.st === P.LS_CARRIED || it.st === P.LS_BOAT) transit++;
    hud.update(v, tick, this.eligible, transit, touch);
    // прицел: у пушки — прицел с решением, иначе — маркер
    let spec: ReticleSpec = { mode: 'off', slot: 0, text: '', state: 'none' };
    this._hint = null;
    if (this.eligible && me && v.phase === 'raid') {
      if (this.nearCannon >= 0) {
        const c = this.cannons[this.nearCannon], pos = P.PIRATE_CANNONS[this.nearCannon];
        this.aimBoats.length = 0;
        for (const b of this.boats.values()) if (b.st === P.DS_IN || b.st === P.DS_MOOR || b.st === P.DS_DOCK || b.st === P.DS_OUT) {
          const vx = (b.x - b.px) / Math.max(dt, 1e-3), vz = (b.z - b.pz) / Math.max(dt, 1e-3);
          this.aimBoats.push({ id: b.id, x: b.x, z: b.z, vx: b.st === P.DS_DOCK || b.st === P.DS_MOOR ? 0 : Math.max(-5, Math.min(5, vx)), vz: b.st === P.DS_DOCK || b.st === P.DS_MOOR ? 0 : Math.max(-5, Math.min(5, vz)) });
        }
        const o = P.aimOrigin(me.x, me.y, me.z, me.yaw);
        P.cannonSolve(pos.x, pos.z, o.x, o.y, o.z, me.yaw, me.pitch, this.aimBoats, v.hp > 0 && this.shipOn && this.shipPose.anchored >= 1, this.shot);
        const reload = Math.max(0, (c.readyAt - tick) / TICK_RATE);
        const s = this.shot;
        const state: ReticleSpec['state'] = !s.ok ? 'bad' : reload > 0 ? 'wait' : 'good';
        const what = s.kind === P.SK_BOAT ? 'шлюпка' : s.kind === P.SK_SHIP ? 'корабль' : 'вода';
        spec = { mode: 'cannon', slot: me.slot, state, text: !s.ok ? 'Цель на берегу — подними прицел к морю' : reload > 0 ? `Перезарядка ${reload.toFixed(1)} с · ${what}` : `Огонь! · ${what}` };
        this.fx.aim(s.x !== undefined ? { x: s.x, y: s.y, z: s.z } : null, !s.ok ? 0xff5a4f : s.kind === P.SK_WATER ? 0xeaf8ff : 0x7bd88f, s.kind === P.SK_SHIP ? 2.2 : P.PIRATE_SPLASH_R * 0.55);
        this._hint = { keys: touch ? [] : ['ЛКМ'], text: `${touch ? 'кнопка «Огонь» — ' : ''}выстрел ядром · целься в шлюпку или корабль · пушка заряжается 3,5 с` };
      } else {
        spec = { mode: 'marker', slot: me.slot, text: '', state: 'none' };
        this.fx.aim(null, 0, 1);
        if (this.nearLoot) this._hint = { keys: [], text: 'Коснись брошенного ящика — он вернётся в кучу' };
        else if (tick - this.raidStart < 25 * TICK_RATE) this._hint = { keys: touch ? [] : ['ЛКМ'], text: `${touch ? 'кнопка «Огонь» — ' : ''}краска по ворам · два попадания — заляпан · у пушки — ядром по шлюпкам` };
      }
    } else this.fx.aim(null, 0, 1);
    hud.reticle(spec, dt);
    // стрелки к угрозам за краем экрана
    this.arrows.length = 0;
    if (this.eligible && v.phase === 'raid') this.collectArrows(cam, tick);
    hud.setArrows(this.arrows);
  }

  private collectArrows(cam: THREE.PerspectiveCamera, tick: number): void {
    const W = this.hud.width, H = this.hud.height, me = this.me;
    if (!me) return;
    const list: Array<{ kind: ArrowSpec['kind']; x: number; y: number; z: number; w: number; label: string }> = [];
    const last = this.snaps[this.snaps.length - 1];
    for (const t of this.tracks.values()) {
      const r = last?.p.get(t.id);
      if (!r || (r[6] & P.PL_ABOARD)) continue;
      const thief = r[7] >= 0;
      list.push({ kind: thief ? 'thief' : 'pirate', x: t.x, y: 1.1, z: t.z, w: thief ? 0 : 3, label: '' });
    }
    for (const b of this.boats.values()) if (b.st === P.DS_IN && tick - b.born > 90 || b.st === P.DS_MOOR) list.push({ kind: 'boat', x: b.x, y: 0.5, z: b.z, w: 6, label: '' });
    for (const it of this.items.values()) if (it.st === P.LS_DROPPED && it.shown) list.push({ kind: 'loot', x: it.fxCur ?? it.x, y: 0.5, z: it.fzCur ?? it.z, w: 1, label: '' });
    // чем ближе, тем раньше; воры и ящики важнее
    list.sort((p, q) => (p.w + Math.hypot(p.x - me.x, p.z - me.z) * 0.1) - (q.w + Math.hypot(q.x - me.x, q.z - me.z) * 0.1));
    const margin = 46;
    for (const e of list) {
      if (this.arrows.length >= 8) break;
      _v.set(e.x, e.y, e.z).project(cam);
      const behind = _v.z > 1;
      let sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * H;
      if (!behind && sx > margin && sx < W - margin && sy > margin && sy < H - margin) continue;
      // с экрана: угол к центру → на эллипс у края
      let dx = sx - W / 2, dy = sy - H / 2;
      if (behind) { dx = -dx; dy = -dy; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = H; }
      const ang = Math.atan2(dy, dx);
      const rx = W / 2 - margin, ry = H / 2 - margin;
      const k = 1 / Math.max(Math.abs(Math.cos(ang)) / rx, Math.abs(Math.sin(ang)) / ry);
      sx = W / 2 + Math.cos(ang) * k; sy = H / 2 + Math.sin(ang) * k;
      const dist = Math.hypot(e.x - me.x, e.z - me.z);
      this.arrows.push({ kind: e.kind, x: sx, y: sy, angle: ang, label: dist >= 10 ? String(Math.round(dist)) : '' });
    }
  }

  // ------------------------------------------------------------ события

  private runQueue(tick: number): void {
    this.queue.sort((a, b) => a.k - b.k);
    while (this.queue.length && this.queue[0].k <= tick + 1) {
      const q = this.queue.shift()!;
      this.handle(q.e, tick - q.k);
    }
    // совсем старое (вкладка спала) не догоняем
    if (this.queue.length > 400) this.queue.splice(0, this.queue.length - 200);
  }

  private handle(e: P.PirateFx, late: number): void {
    const stale = late > TICK_RATE * 1.5;
    const s = this.hooks.sound, fx = this.fx, mine = this.me?.slot ?? -1;
    switch (e[0]) {
      case 'fire': {
        // [пушка, стрелок, x, y, z, тиков, вид]
        const ci = e[1], slot = e[2], c = this.cannons[ci];
        if (!c) break;
        const pos = P.PIRATE_CANNONS[ci];
        c.readyAt = this.tick + P.PIRATE_CANNON_CD - Math.max(0, late);
        c.anim.recoil = 1;
        const dx = e[3] - pos.x, dz = e[5] - pos.z, dist = Math.hypot(dx, dz) || 1;
        c.anim.yaw = Math.atan2(-dx, -dz);
        c.anim.pitch = Math.min(0.6, Math.max(0.05, Math.atan2(4 * P.shellApex(dist), Math.max(4, dist))));
        c.model.group.updateMatrixWorld(true);
        c.model.update(c.anim, 0);
        c.model.muzzle.getWorldPosition(_v);
        const o = { x: _v.x, y: _v.y, z: _v.z };
        if (!stale) {
          fx.shoot(o, { x: e[3], y: e[4], z: e[5] }, this.tick - Math.max(0, late), e[6], false);
          fx.muzzle(o, dx / dist, 0.25, dz / dist, true);
          s.boom([o.x, o.y, o.z], 0.8);
        }
        void slot;
        break;
      }
      case 'sh': {
        // [орудие, x, z, тиков]: ядро корабля летит к причалу; красный круг на земле
        if (stale) break;
        const gun = e[1], tx = e[2], tz = e[3], ticks = e[4];
        if (this.shipMuzzle(gun, _v, _v2)) {
          const o = { x: _v.x, y: _v.y, z: _v.z };
          fx.shoot(o, { x: tx, y: 0.3, z: tz }, this.tick - Math.max(0, late), ticks, true);
          fx.muzzle(o, _v2.x, _v2.y, _v2.z, true);
          this.shipAnim.guns[4 + (gun & 3)] = 1;
          s.lobbyEvent('cannon', [o.x, o.y, o.z]);
        }
        fx.telegraph(tx, tz, P.PIRATE_SHELL_R, this.tick - Math.max(0, late), this.tick - Math.max(0, late) + ticks);
        break;
      }
      case 'sk': {
        // [x, z]: упало на причал
        if (stale) break;
        fx.puff(e[1], 0.5, e[2], 7, 1.4); fx.burst(e[1], 0.4, e[2], 0xd9c7a0, 18); fx.ring(e[1], 0.06, e[2], 0xffe9b0, 3.4, 0.5, 0.4);
        fx.splinters(e[1], 0.3, e[2], 10);
        s.boom([e[1], 0.5, e[2]], 1);
        break;
      }
      case 'pt': {
        // [стрелок, ox, oy, oz, ex, ey, ez, попал]: шарик краски
        if (stale) break;
        const slot = e[1], color = P.paintOf(slot);
        const dx = e[5] - e[2], dy = e[6] - e[3], dz = e[7] - e[4], d = Math.hypot(dx, dy, dz) || 1;
        // дуло — у руки: чуть вперёд, вправо и ниже взгляда
        const from = { x: e[2] + dx / d * 0.55 + dz / d * 0.22, y: e[3] - 0.38 + dy / d * 0.55, z: e[4] + dz / d * 0.55 - dx / d * 0.22 };
        fx.pellet(from, { x: e[5], y: e[6], z: e[7] }, color, e[8] === 1);
        if (slot === mine) s.pop(null); else s.pop([from.x, from.y, from.z]);
        break;
      }
      case 'ph': {
        // [пират, стрелок, осталось, x, z]
        const t = this.tracks.get(e[1]);
        const color = P.paintOf(e[2]);
        if (t) { t.flash = 1; t.tint = color; }
        if (!stale) {
          fx.paintHit(e[4], 0.9, e[5], color);
          s.splat([e[4], 0.9, e[5]], 0);
          if (e[2] === mine) { this.hud.hitmark(false); s.hitmarker(false); }
        }
        break;
      }
      case 'ko': {
        // [пират, стрелок, x, z]: заляпан — лужа цвета краски
        const t = this.tracks.get(e[1]);
        const color = P.paintOf(e[2]);
        const last = this.snaps[this.snaps.length - 1]?.p.get(e[1]);
        this.ghosts.push({ kind: 'die', seed: t?.seed ?? 0.5, captain: !!(last && (last[6] & P.PL_CAPTAIN)), x: e[3], z: e[4], yaw: t?.yaw ?? 0, tx: e[3], tz: e[4], t: 0, dur: 1.7, tint: color, boat: false });
        this.tracks.delete(e[1]);
        if (!stale) {
          fx.puddle(e[3], e[4], color);
          s.splat([e[3], 0.5, e[4]], 0);
          s.popAt([e[3], 0.5, e[4]], 0);
          const fl = this.hooks.lobbyFx();
          fl?.floatText(e[3], 2.1, e[4], 'ЗАЛЯПАН!', `#${color.toString(16).padStart(6, '0')}`);
          if (e[2] === mine) { this.hud.hitmark(true); s.hitmarker(true); s.kill(false); }
        }
        break;
      }
      case 'fl': {
        // [пират, x, z]: прыгнул в воду
        const t = this.tracks.get(e[1]);
        const last = this.snaps[this.snaps.length - 1]?.p.get(e[1]);
        const x = e[2], z = e[3];
        this.ghosts.push({ kind: 'dive', seed: t?.seed ?? 0.5, captain: !!(last && (last[6] & P.PL_CAPTAIN)), x, z, yaw: t?.yaw ?? 0, tx: x + (Math.random() - 0.5) * 1.6, tz: z + 1.6 + Math.random() * 0.8, t: 0, dur: 0.75, tint: 0, boat: false });
        this.tracks.delete(e[1]);
        break;
      }
      case 'wh': {
        // [стрелок, x, z]: ядро в воду
        if (stale) break;
        fx.splash(e[2], e[3], true);
        s.splash([e[2], WATER_Y, e[3]]);
        break;
      }
      case 'dh': {
        // [шлюпка, осталось, стрелок, x, z]: попали, не потопили
        const b = this.boats.get(e[1]);
        if (b) b.hit = 1;
        if (stale) break;
        fx.splinters(e[4], WATER_Y + 0.8, e[5], 12); fx.splash(e[4], e[5], false); fx.puff(e[4], WATER_Y + 1, e[5], 4, 0.9);
        s.planks([e[4], WATER_Y + 1, e[5]]); s.clang([e[4], WATER_Y + 1, e[5]]);
        if (e[3] === mine) s.hitmarker(false);
        break;
      }
      case 'sink': {
        // [шлюпка, стрелок, x, z]: затонула
        const b = this.boats.get(e[1]);
        if (b && !b.sunkAt) { b.sunkAt = this.tick; b.st = P.DS_SUNK; }
        if (stale) break;
        fx.splash(e[3], e[4], true); fx.splinters(e[3], WATER_Y + 0.8, e[4], 22); fx.puff(e[3], WATER_Y + 1, e[4], 7, 1.3);
        s.sink([e[3], WATER_Y, e[4]]);
        const fl = this.hooks.lobbyFx();
        fl?.floatText(e[3], 3, e[4], 'ШЛЮПКА!', '#7bd88f');
        if (e[2] === mine) { this.hud.hitmark(true); s.kill(false); }
        break;
      }
      case 'hit': {
        // [стрелок, осталось, x, y, z]: попали в корабль
        this.shipHit = 1;
        const slot = e[1];
        if (this.shipAnim.guns.length) for (let i = 0; i < 4; i++) this.shipAnim.guns[i] *= 0.5;
        if (stale) break;
        fx.splinters(e[3], e[4], e[5], 16); fx.puff(e[3], e[4], e[5], 6, 1.4); fx.ring(e[3], e[4], e[5], 0xffe9b0, 3.0, 0.5, 0.4);
        s.boom([e[3], e[4], e[5]], 1); s.planks([e[3], e[4], e[5]]);
        if (slot === mine) { this.hud.hitmark(false); s.hitmarker(true); }
        break;
      }
      case 'st': {
        // [вещь, x, z]: ящик доставлен на корабль
        if (stale) break;
        const fl = this.hooks.lobbyFx();
        fl?.floatText(e[2], 4, e[3], 'Украдено!', '#ff6b5a');
        s.lobbyEvent('loss', [e[2], 2, e[3]]);
        break;
      }
      case 'rs': {
        // [вещь, стрелок, x, z]: спасён (стрелок 0 — всплыл из затонувшей шлюпки)
        const it = this.items.get(e[1]);
        if (it) { it.fxCur = e[3]; it.fzCur = e[4]; it.fx = e[3]; it.fz = e[4]; }
        if (stale) break;
        const home = it ? { x: it.x, z: it.z } : { x: e[3], z: e[4] };
        fx.ring(home.x, 0.06, home.z, 0xffe066, 1.8, 0.5, 0.3);
        if (e[2] === mine) { s.coin(null); this.hooks.lobbyFx()?.floatText(home.x, 2.2, home.z, 'Спасён!', '#ffe066'); }
        else s.coin([home.x, 0.5, home.z]);
        break;
      }
      case 'dr': {
        // [вещь, x, z]: уронили
        const it = this.items.get(e[1]);
        if (it) { it.fx = e[2]; it.fz = e[3]; it.fxCur = e[2]; it.fzCur = e[3]; }
        if (!stale) { fx.puff(e[2], 0.3, e[3], 2, 0.6); s.clang([e[2], 0.4, e[3]]); }
        break;
      }
      case 'wave': {
        // [номер, шлюпок]: гудок корабля
        if (!stale) s.lobbyEvent('horn', [this.shipPose.x, 3, this.shipPose.z]);
        break;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------ служебное

  /** Стрелок нажал огонь: прицел вздрагивает (на сервере тот же перерыв) */
  localFire(tick: number): void {
    if (!this.raiding || this.nearCannon >= 0) return;
    if (tick - this.myMarkerAt < P.PIRATE_MARKER_CD) return;
    this.myMarkerAt = tick;
    this.hud.kick();
  }

  debug(): Record<string, unknown> {
    return {
      phase: this.view.phase, wave: this.view.wave, hp: this.view.hp, hpMax: this.view.hpMax, stolen: this.view.stolen, left: this.view.left,
      pirates: this.tracks.size, boats: this.boats.size, items: this.items.size, snaps: this.snaps.length, queue: this.queue.length,
      ship: this.shipOn ? { x: this.shipPose.x, z: this.shipPose.z, yaw: this.shipPose.yaw, anchored: this.shipPose.anchored } : null,
      crowd: this.crowd.count, nearCannon: this.nearCannon, eligible: this.eligible,
      // для проверок вживую: где сейчас пираты и шлюпки на экране
      pirateAt: [...this.tracks.values()].map(t => [t.id, Math.round(t.x * 10) / 10, Math.round(t.z * 10) / 10]),
      boatAt: [...this.boats.values()].map(b => [b.id, Math.round(b.x * 10) / 10, Math.round(b.z * 10) / 10, b.st]),
    };
  }

  dispose(): void {
    this.hud.dispose();
    this.fx.dispose();
    this.crowd.dispose();
    this.ship.dispose();
    for (const b of this.boats.values()) b.model.dispose();
    for (const c of this.cannons) c.model.dispose();
    for (const m of this.markMat) { m.map?.dispose(); m.dispose(); }
    for (const l of this.cannonLabels) { (l.material as THREE.SpriteMaterial).map?.dispose(); l.material.dispose(); }
    for (const r of this.cannonRings) { r.material instanceof THREE.Material && r.material.dispose(); }
    this.kit.crate.dispose(); this.kit.barrel.dispose(); this.kit.ball.dispose(); this.kit.material.dispose();
    this.group.removeFromParent();
  }
}

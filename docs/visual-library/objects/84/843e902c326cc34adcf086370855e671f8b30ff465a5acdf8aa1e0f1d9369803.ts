// Сцена пряток «Рыбный двор». Прячущийся видит себя со стороны (камера за предметом, размер камеры — по
// предмету), наводит прицел на вещь двора и кликает (ЛКМ) — становится такой же; F — замереть, R — повернуть, Z — дразнить.
// Ловец — от первого лица с краскомётом: ЛКМ — выстрел (сервер откатывает прячущихся к тому, что ловец видел).
import * as THREE from 'three';
import { EYE_HEIGHT } from '../../shared/constants.ts';
import { HIDE_SHOT_TICKS, HIDE_TAKE_RANGE, type HideClientMsg, type HideEvent, type HideRosterMsg, type HideStateMsg } from '../../shared/hide.ts';
import { HIDE_KIND, hideHits, hideKindHint } from '../../shared/hideprops.ts';
import { hideFillProps, hideFits, hideRayBody, hideStaticWorld } from '../../shared/hidephysics.ts';
import { viewDir } from '../../shared/math.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED, encodeInputs } from '../../shared/protocol.ts';
import { makeInput } from '../../shared/sim.ts';
import { makeRayHit } from '../../shared/world.ts';
import { Avatar, tickAvatarShared, type AvatarPose } from '../render/avatar.ts';
import { narrowFov } from '../render/renderer.ts';
import type { Scene, SceneDeps } from '../scene.ts';
import type { Quality } from '../settings.ts';
import { TOUCH, type TouchMode } from '../touch.ts';
import { HideFx } from './fx.ts';
import { PaintGun } from './gun.ts';
import { HideHud, takeHint, type HideTouchAction } from './hud.ts';
import { HideMotion } from './motion.ts';
import { HideProps } from './props.ts';
import { HideSfx } from './sfx.ts';
import { HideWorld } from './world.ts';

type V3 = [number, number, number];
interface Ghost { avatar: Avatar; pose: AvatarPose; until: number }

const FOV = 72;

export class HideScene implements Scene {
  readonly kind = 'hide' as const;
  readonly wantsPointer = true;
  readonly world: HideWorld;
  private readonly d: SceneDeps;
  private readonly statics = hideStaticWorld();
  private readonly props: HideProps;
  private readonly fx: HideFx;
  private readonly gun = new PaintGun();
  private readonly sfx: HideSfx;
  private readonly hud: HideHud;
  private motion = new HideMotion();
  private readonly roster = new Map<number, { nick: string; level: number; outfit: Outfit }>();
  private readonly avatars = new Map<number, { avatar: Avatar; pose: AvatarPose }>();
  private readonly ghosts: Ghost[] = [];
  private msg: HideStateMsg | null = null;
  private active = false;
  private acc = 0;
  private seq = 0;
  private readonly inputs = [makeInput()];
  private lastHud = 0;
  private lastShotAt = -1e9;
  private target = 0;
  /** Почему предметом под прицелом сейчас не стать (не помещается, заляпан) — или '' */
  private refuseWhy = '';
  private lastTickSound = -1;
  private orbit = 0;
  private readonly dir = { x: 0, y: 0, z: -1 };
  private readonly look = new THREE.Vector3();
  private readonly hit = makeRayHit();
  private fov = FOV;

  constructor(d: SceneDeps) {
    this.d = d;
    this.world = new HideWorld(d.renderer);
    this.props = new HideProps(this.world.scene);
    this.fx = new HideFx(this.world.scene);
    this.sfx = new HideSfx(d.sound);
    this.hud = new HideHud(d.hudRoot, (a) => this.touchAction(a));
  }

  get touchMode(): TouchMode {
    const m = this.msg;
    if (!m) return 'none';
    if (m.self.role === 'hunter' && m.phase === 'seek') return 'shoot';
    if (m.self.role === 'prop' && (m.phase === 'hide' || m.phase === 'seek')) return 'walk';
    return 'none';
  }
  get touchUseIcon(): string { return this.msg?.self.role === 'hunter' ? '◎' : '✨'; }

  setQuality(q: Quality, slow = false): void {
    this.world.setQuality(q === 'low' || slow ? 'low' : q === 'medium' ? 'medium' : 'high');
  }

  enter(): void {
    this.active = true;
    this.msg = null;
    this.seq = 0;
    this.acc = 0;
    this.target = 0;
    this.motion = new HideMotion();
    this.props.clear();
    this.fx.clear();
    this.world.doorTarget = 0;
    this.hud.show(true);
    this.d.ui.chat.setPlaceholder('Сообщение или /help');
    this.d.sound.setOutdoor(1);
  }

  exit(): void {
    this.active = false;
    this.msg = null;
    this.hud.show(false);
    this.props.clear();
    this.fx.clear();
    for (const a of this.avatars.values()) a.avatar.dispose(this.world.scene);
    this.avatars.clear();
    for (const g of this.ghosts) g.avatar.dispose(this.world.scene);
    this.ghosts.length = 0;
    this.motion.clear();
    this.gun.visible = false;
  }

  // ------------------------------------------------------------ сеть

  onJson(msg: ServerMsg): void {
    if (!this.active) return;
    const m = msg as { t: string };
    if (m.t === 'hide_state') this.state(msg as HideStateMsg);
    else if (m.t === 'hide_ev') for (const e of (msg as { e: HideEvent[] }).e) this.event(e);
    else if (m.t === 'hide_roster') {
      this.roster.clear();
      for (const p of (msg as HideRosterMsg).players) this.roster.set(p.id, p);
      for (const [id, a] of this.avatars) this.dress(id, a.avatar);
    }
  }

  onSnapshot(_buf: ArrayBuffer, _at: number): void {}

  private state(m: HideStateMsg): void {
    const prev = this.msg;
    this.msg = m;
    this.motion.accept(m, performance.now());
    this.world.doorTarget = m.phase === 'seek' || m.phase === 'result' ? 1 : 0;
    if (prev && prev.match === m.match && prev.round !== m.round) this.fx.clear();
    if (!prev || prev.phase !== m.phase || prev.self.role !== m.self.role) this.hud.update(m, m.tick);
  }

  private dress(id: number, a: Avatar): void {
    const r = this.roster.get(id);
    if (!r) return;
    a.setInfo(r.nick, null, false, r.level);
    a.setOutfit(r.outfit);
  }

  private event(e: HideEvent): void {
    const me = this.msg?.self.id ?? -1;
    switch (e.k) {
      case 'shot': {
        const mine = e.by === me;
        const land = () => this.impact(e.to, e.n, e.hit, e.size, mine);
        if (mine) land();
        else { this.sfx.blaster(e.from); this.fx.shot(e.from, e.to, land); this.avatars.get(e.by)?.avatar.onShot(); }
        break;
      }
      case 'catch': {
        const p: V3 = [e.x, e.y, e.z];
        this.fx.confettiAt(p);
        this.sfx.caught(p, e.by === me || e.who === me);
        this.hud.feed(e.text, 'big');
        if (e.by === me) this.hud.hit(true);
        this.popGhost(e.who, p);
        break;
      }
      // своя насмешка — тихий звук из тайника, без нот; дрожь предмета приходит отдельным событием
      case 'taunt': this.sfx.taunt([e.x, e.y, e.z], e.s); break;
      case 'wiggle': this.props.wiggle(e.id, performance.now() / 1000); break;
      case 'puff': this.fx.puff([e.x, e.y, e.z]); this.sfx.puff([e.x, e.y, e.z]); break;
      case 'feed': this.hud.feed(e.text); break;
      case 'pts': this.hud.points(e.n, e.why); break;
      case 'note': this.hud.note(e.text); break;
      case 'door': this.sfx.horn(); this.hud.feed('🚪 Ловцы вышли на охоту!', 'big'); break;
      case 'final': this.sfx.finalBell(); break;
    }
  }

  /** Краска долетела: по прячущемуся — писк по размеру, по стене и пустому предмету — клякса на 20 с */
  private impact(to: V3, n: V3, hit: string, size: number, mine: boolean): void {
    if (hit === 'air') return;
    if (hit === 'prop') {
      this.sfx.squeak(to, size);
      this.fx.splash(to, n, 18);
      if (mine) { this.hud.hit(false); this.d.sound.hitmarker(false); }
      return;
    }
    // клякса на пустом предмете — по его размеру: издалека видно, что он проверен
    this.fx.decal(to, n, hit === 'decor' ? [0.42, 0.6, 0.75][size] ?? 0.6 : 0.7);
    this.fx.splash(to, n, 8);
    this.sfx.splat(to);
  }

  /** Пойманный выскакивает желейкой: «Попался!» — и через пару секунд исчезает */
  private popGhost(id: number, p: V3): void {
    const avatar = new Avatar(70000 + id, { voice: false });
    this.dress(id, avatar);
    avatar.addTo(this.world.scene);
    avatar.say('Попался! 🙈');
    this.ghosts.push({ avatar, pose: { x: p[0], y: p[1], z: p[2], yaw: Math.random() * 6, pitch: 0, flags: E_ALIVE | E_GROUNDED }, until: performance.now() + 2600 });
  }

  // ------------------------------------------------------------ действия

  private send(msg: HideClientMsg): void { this.d.net.send(msg); }

  private shoot(): void {
    const m = this.msg;
    if (!m || m.self.role !== 'hunter' || m.phase !== 'seek') return;
    const now = performance.now();
    if (now - this.lastShotAt < (HIDE_SHOT_TICKS * 1000) / 60) return;
    if (m.self.jam) { this.sfx.dry(); this.gun.jam(); this.hud.note('Краска кончилась — бак наполняется'); this.lastShotAt = now; return; }
    this.lastShotAt = now;
    const yaw = this.d.input.yaw, pitch = Math.max(-1.2, Math.min(1.2, this.d.input.pitch));
    this.send({ t: 'hide', a: 'shoot', aim: [yaw, pitch], view: Math.round(this.motion.renderTick * 100) / 100, seq: this.seq });
    this.gun.fire();
    this.sfx.blaster(null);
    // свой комок краски летит сразу (куда попал — скажет сервер)
    viewDir(yaw, pitch, this.dir);
    const p = this.motion.position, o = { x: p.x, y: p.y + EYE_HEIGHT, z: p.z };
    let t = 42;
    if (this.statics.raycast(o.x, o.y, o.z, this.dir.x, this.dir.y, this.dir.z, t, this.hit, true)) t = this.hit.t;
    for (const b of this.motion.bodies.values()) t = Math.min(t, hideRayBody(o.x, o.y, o.z, this.dir.x, this.dir.y, this.dir.z, b, t));
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    this.fx.shot([o.x + right.x * 0.18 + this.dir.x * 0.5, o.y - 0.16, o.z + right.z * 0.18 + this.dir.z * 0.5], [o.x + this.dir.x * t, o.y + this.dir.y * t, o.z + this.dir.z * t]);
  }

  private act(a: HideTouchAction | 'rotateFine'): void {
    const m = this.msg;
    if (!m || m.self.role !== 'prop' || (m.phase !== 'hide' && m.phase !== 'seek')) return;
    if (a === 'take') {
      if (this.target && this.refuseWhy) this.hud.refuse();
      else if (this.target) this.send({ t: 'hide', a: 'take', id: this.target });
      else this.hud.note(TOUCH ? 'Наведи прицел на предмет двора — и «стать»' : 'Наведи прицел на предмет двора и кликни');
    } else if (a === 'lock') this.send({ t: 'hide', a: 'lock' });
    else if (a === 'rotate') this.send({ t: 'hide', a: 'rotate', n: 3 });
    else if (a === 'rotateFine') this.send({ t: 'hide', a: 'rotate', n: 1 });
    else this.send({ t: 'hide', a: 'taunt' });
  }

  private touchAction(a: HideTouchAction): void { this.act(a); }

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (code === 'Tab') { e.preventDefault(); this.hud.scoreboard(down); return true; }
    if (!down || e.repeat || this.d.input.blocked) return false;
    if (code === 'KeyF') { this.act('lock'); return true; }
    if (code === 'KeyR' && this.msg?.self.role === 'prop') { this.act(e.shiftKey ? 'rotateFine' : 'rotate'); return true; }
    if (code === 'KeyZ' && this.msg?.self.role === 'prop') { this.act('taunt'); return true; }
    return false;
  }

  /** ЛКМ: ищущий стреляет краской, прячущийся превращается в предмет под прицелом (E — то же самое, кнопка «действие» на телефоне) */
  onUse(_mouse: boolean): void {
    const role = this.msg?.self.role;
    if (role === 'hunter') this.shoot();
    else if (role === 'prop') this.act('take');
  }

  resize(w: number, h: number): void {
    this.world.resize(w, h);
    this.gun.resize(w, h);
    this.fov = narrowFov(FOV, w / h);
    this.world.camera.fov = this.fov;
    this.world.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ кадр

  frame(now: number, dt: number): void {
    if (!this.active) return;
    const m = this.msg, cam = this.world.camera, input = this.d.input;
    input.pitch = Math.max(-1.2, Math.min(1.2, input.pitch));
    if (m) {
      const tick = this.motion.tick(now);
      this.acc = Math.min(0.15, this.acc + dt);
      while (this.acc >= 1 / 60) {
        this.acc -= 1 / 60;
        const inp = this.inputs[0];
        inp.seq = ++this.seq;
        inp.buttons = input.sample();
        inp.yaw = Math.fround(input.yaw);
        inp.pitch = Math.fround(input.pitch);
        inp.viewTick = tick;
        this.motion.step(inp);
        this.d.net.sendBinary(encodeInputs(this.inputs, 0, 1, this.d.net.epoch));
      }
      this.motion.render(now, dt, this.acc * 60);
    }
    const s = m?.self, phase = m?.phase ?? 'gather';
    const yaw = input.yaw, pitch = input.pitch;
    const pos = this.motion.position;
    const playing = phase === 'hide' || phase === 'seek';
    const hunterView = !!m && s!.role === 'hunter' && playing;
    const propView = !!m && s!.role === 'prop' && playing;
    viewDir(yaw, pitch, this.dir);
    if (hunterView) {
      cam.position.set(pos.x, pos.y + EYE_HEIGHT, pos.z);
    } else if (propView || (m && s!.role === 'caught')) {
      const h = propView ? HIDE_KIND[s!.kind].h : 0.6;
      this.thirdPerson(pos.x, pos.y + h * 0.75 + 0.2, pos.z, 1.7 + h * 1.7);
    } else {
      // ожидание, итоги, зритель: облёт двора
      this.orbit += dt * 0.06;
      const a = this.orbit + yaw * 0.5;
      cam.position.set(Math.sin(a) * 24, 13, Math.cos(a) * 20);
      this.look.set(0, 0.5, 0);
      cam.lookAt(this.look);
    }
    if (hunterView || propView || (m && s!.role === 'caught')) {
      cam.rotation.set(pitch, yaw, 0, 'YXZ');
    }
    this.d.sound.setListener(cam.position.x, cam.position.y, cam.position.z, this.dir.x, this.dir.y, this.dir.z);

    // цель превращения: луч из камеры по центру экрана
    this.target = 0;
    this.refuseWhy = '';
    if (propView && m) {
      let best = 30, id = 0;
      const o = cam.position;
      for (const b of this.motion.bodies.values()) {
        if (b.id === this.motion.ownId) continue;
        const t = hideRayBody(o.x, o.y, o.z, this.dir.x, this.dir.y, this.dir.z, b, best);
        if (t < best) { best = t; id = b.id; }
      }
      const b = id ? this.motion.bodies.get(id) : undefined;
      if (b && Math.hypot(b.x - pos.x, b.z - pos.z) <= HIDE_TAKE_RANGE + 0.3 && !this.statics.raycast(o.x, o.y, o.z, this.dir.x, this.dir.y, this.dir.z, best, this.hit, true, true)) {
        this.target = id;
        if (b.kind === s!.kind && b.yaw === s!.yaw) this.hud.setHint(`Ты уже ${HIDE_KIND[b.kind].name}`);
        else {
          // как проверит сервер: облик в той же точке не должен врезаться в стены и предметы (свой не в счёт)
          hideFillProps(this.motion.world, this.motion.physics.props, this.motion.ownId);
          if (s!.hits >= hideHits(b.kind)) this.refuseWhy = `Заляпан — ${HIDE_KIND[b.kind].name} не выдержит`;
          else if (!hideFits(this.motion.world, pos.x, pos.y, pos.z, b.kind, b.yaw)) this.refuseWhy = 'Не помещается — отойди на свободное место';
          this.hud.setHint(this.refuseWhy || takeHint(b.kind, s!.hits, hideKindHint(b.kind)), !!this.refuseWhy);
        }
      } else this.hud.setHint(null);
    }

    const t = now / 1000;
    if (this.props.update(this.motion.shown, t, this.target, !!this.refuseWhy)) this.d.renderer.refreshShadows();
    this.updateAvatars(dt, t, hunterView ? s!.id : -1);
    this.fx.update(dt);
    this.world.update(dt);
    tickAvatarShared(t, this.d.renderer.canvas.clientHeight || window.innerHeight);

    // краскомёт
    this.gun.visible = hunterView;
    if (hunterView) {
      const st = this.motion.predictor.state;
      this.gun.update(dt, s!.paint, s!.jam, Math.min(1, Math.hypot(st.vx, st.vz) / 8));
    }
    // последние 10 секунд — тиканье
    if (m && phase === 'seek') {
      const left = Math.ceil((m.phaseEnd - this.motion.tick(now)) / 60);
      if (left <= 10 && left >= 1 && left !== this.lastTickSound) { this.lastTickSound = left; this.sfx.tick(left === 1); }
    }
    if (m && now - this.lastHud > 100) {
      this.lastHud = now;
      this.hud.update(m, this.motion.tick(now));
      this.hud.root.classList.toggle('prop-touch', TOUCH && propView);
    }
    this.world.render();
    this.gun.render(this.d.renderer);
  }

  /** Камера за предметом: опора над ним, отъезд по размеру, не залезает в стены */
  private thirdPerson(px: number, py: number, pz: number, back: number): void {
    const cam = this.world.camera;
    const dx = -this.dir.x, dy = -this.dir.y + 0.18, dz = -this.dir.z;
    const len = Math.hypot(dx, dy, dz);
    let dist = back;
    if (this.statics.raycast(px, py, pz, dx / len, dy / len, dz / len, back, this.hit, false, true)) dist = Math.max(0.3, this.hit.t - 0.2);
    cam.position.set(px + (dx / len) * dist, Math.max(0.15, py + (dy / len) * dist), pz + (dz / len) * dist);
  }

  private updateAvatars(dt: number, t: number, self: number): void {
    const seen = new Set<number>();
    const camPos = this.world.camera.position;
    for (const h of this.motion.hunters) {
      if (h.id === self) continue;
      seen.add(h.id);
      let a = this.avatars.get(h.id);
      if (!a) {
        a = { avatar: new Avatar(h.id, { gun: true, voice: false }), pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED } };
        this.dress(h.id, a.avatar);
        a.avatar.addTo(this.world.scene);
        this.avatars.set(h.id, a);
        this.world.paintLater();
      }
      Object.assign(a.pose, { x: h.x, y: h.y, z: h.z, yaw: h.yaw, pitch: h.pitch });
      a.avatar.update(a.pose, dt, t, this.statics, camPos, false);
    }
    for (const [id, a] of this.avatars) if (!seen.has(id)) { a.avatar.dispose(this.world.scene); this.avatars.delete(id); }
    const now = performance.now();
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      if (now > g.until) { g.avatar.dispose(this.world.scene); this.ghosts.splice(i, 1); continue; }
      g.pose.yaw += dt * 2.5;
      g.avatar.update(g.pose, dt, t, this.statics, camPos, false);
    }
  }

  debugState(): Record<string, unknown> | null {
    const m = this.msg;
    const p = this.motion.predictor.state;
    return {
      mode: 'hide', ready: !!m, phase: m?.phase, round: m?.round, match: m?.match, role: m?.self.role, kind: m?.self.kind, yaw: m?.self.yaw,
      locked: m?.self.locked, hits: m?.self.hits, paint: m?.self.paint, jam: m?.self.jam, left: m?.left, total: m?.total, id: m?.self.id, prop: m?.self.prop,
      target: this.target, targetKind: this.target ? this.motion.bodies.get(this.target)?.kind : null,
      player: { x: p.x, y: p.y, z: p.z }, rendered: { ...this.motion.position }, corrections: this.motion.predictor.corrections,
      bodies: this.motion.bodies.size, shown: this.motion.shown.length, hunters: this.motion.hunters.length, renderTick: this.motion.renderTick,
      winner: m?.res?.winner ?? null, lines: m?.res?.lines ?? null, rows: m?.rows ?? [],
    };
  }
}

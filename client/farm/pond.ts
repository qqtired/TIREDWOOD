import * as THREE from 'three';
import { FARM_POND, POND_SPOTS, POND_USE } from '../../shared/farmpond.ts';
import type { PondIntent } from '../../shared/farmpondnet.ts';
import {
  FE_BITE, FE_DONE, FE_EARLY, FE_HOOK, FE_LOST, FE_MISS, FE_OFF, FP_BITE, FP_CAST, FP_HOLD, FP_IDLE, FP_WAIT,
} from '../../shared/fishing.ts';
import type { ClientMsg, ServerMsg } from '../../shared/messages.ts';
import { BTN_FIRE, BTN_JUMP } from '../../shared/sim.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import { Fish2Hud } from '../lobby/fish2hud.ts';
import { FishingSpots } from '../lobby/fishing.ts';
import { LobbyFx } from '../lobby/fx.ts';
import type { Avatar } from '../render/avatar.ts';
import { Effects } from '../render/effects.ts';
import type { SceneDeps } from '../scene.ts';
import { Pond3D } from './3d/pond.ts';

type Self = { id: number; x: number; y: number; z: number };

export class FarmPond {
  private readonly d: SceneDeps;
  private readonly collision: CollisionWorld;
  private readonly fishing: FishingSpots;
  private readonly hud: Fish2Hud;
  private readonly models: Pond3D;
  private readonly effects: Effects;
  private readonly fx: LobbyFx;
  private active = false;
  private enabled = false;
  private epoch = -1;
  private turn = 0;
  private seats = Array(6).fill(0) as number[];
  private self: Self | null = null;
  private sentAt = 0;
  private initialized = false;

  constructor(d: SceneDeps, scene: THREE.Scene, collision: CollisionWorld, me: Avatar) {
    this.d = d; this.collision = collision;
    this.effects = new Effects(scene, collision);
    this.fx = new LobbyFx(scene, d.settings.quality === 'auto' ? 'medium' : d.settings.quality);
    this.fishing = new FishingSpots(scene, this.effects, this.fx, d.sound, me, POND_SPOTS, FARM_POND.waterY);
    this.fishing.v2 = true;
    this.models = new Pond3D(scene);
    this.hud = new Fish2Hud(d.hudRoot, scene, d.sound, d.ui, (m) => this.send(m), d.overlay, {
      zone: 'pond', enabled: () => this.active && this.enabled, places: POND_SPOTS, npcUse: POND_USE,
    });
    const free = (): void => { d.input.releaseAll(); d.input.unlock(); };
    this.hud.onBookOpen = free; this.hud.onNpcOpen = free;
    this.hud.onBookClose = () => d.wantPointer(); this.hud.onNpcClose = () => d.wantPointer();
    this.hud.onAutoCast = () => {
      if (this.active && this.enabled && this.activeSeat !== null && !d.input.blocked && !d.ui.chat.isOpen) this.press();
    };
    this.hud.reset();
  }

  enter(): void { this.exit(); this.active = true; this.epoch = -1; this.turn = 0; this.initialized = false; }
  exit(): void {
    this.active = false; this.enabled = false; this.hud.reset(); this.fishing.reset(null);
    this.effects.clear(); this.fx.clear(); this.models.setVisible(false); this.seats.fill(0); this.self = null;
  }

  get activeSeat(): number | null {
    const i = this.self ? this.seats.indexOf(this.self.id) : -1;
    return i >= 0 ? i : null;
  }
  get wantsPointer(): boolean { return !this.hud.modalOpen; }
  get blockActions(): boolean { return this.activeSeat !== null || this.hud.modalOpen; }
  get nearHint(): string | null {
    if (!this.active || !this.enabled || !this.self || this.blockActions) return null;
    if (Math.hypot(this.self.x - POND_USE.x, this.self.z - POND_USE.z) <= POND_USE.r) return 'Рыбак Фома · снасти и улов';
    return POND_SPOTS.some((s) => Math.hypot(this.self!.x - s.x, this.self!.z - s.z) < 1.65) ? 'Порыбачить · 6 мест' : null;
  }

  private send(msg: ClientMsg): void {
    if (['fish', 'reel', 'fishNpc', 'fishBag'].includes(msg.t)) {
      if (!this.enabled || this.epoch !== this.d.net.epoch) return;
      this.d.net.send({ t: 'farmPondAct', epoch: this.epoch, turn: this.turn, intent: msg as PondIntent });
    } else this.d.net.send(msg);
  }

  onJson(msg: ServerMsg): boolean {
    if (!this.active) return false;
    switch (msg.t) {
      case 'farmPond': {
        if (msg.epoch !== this.d.net.epoch) return true;
        const changed = this.seats.flatMap((id, i) => id !== msg.seats[i] ? [i] : []);
        const oldSeat = this.activeSeat;
        this.enabled = true; this.epoch = msg.epoch; this.turn = msg.turn; this.seats = [...msg.seats];
        this.models.setVisible(true);
        if (!this.initialized) this.fishing.reset(msg.fish);
        else if (changed.length) this.fishing.reset(msg.fish, changed);
        this.initialized = true;
        if (oldSeat !== null && this.activeSeat === null) this.hud.off();
        this.hud.onProgress(this.d.ui.me().fishing, msg.now);
        return true;
      }
      case 'farmPondEv':
        if (msg.epoch !== this.d.net.epoch) return true;
        for (const e of msg.e) if (e[0] === 'fish') {
          const [, kind, seat, a, b] = e;
          this.fishing.onEvent(kind, seat, a, b);
          if (seat !== this.activeSeat) continue;
          if (kind === FE_BITE) this.hud.bite(true);
          if ([FE_HOOK, FE_EARLY, FE_MISS].includes(kind)) this.hud.bite(false);
          if (kind === FE_LOST) this.hud.lost();
          if (kind === FE_DONE) this.hud.done(a);
          if (kind === FE_OFF) this.hud.off();
        }
        return true;
      case 'fishNpc': this.hud.onNpc(msg); return true;
      case 'fishProgress': this.hud.onProgress(msg.progress, msg.now); return true;
      case 'fishReel': this.hud.onReel(msg, this.activeSeat ?? -1); return true;
      case 'fishLand': this.hud.onLand(msg); return true;
      case 'fishLost': this.hud.onLost(msg.tier, msg.xp); return true;
      case 'tokens': this.hud.refreshBalance(); return false;
      case 'me': this.hud.onMe(); return false;
      default: return false;
    }
  }

  frame(dt: number, time: number, camera: THREE.Vector3, self: Self | null, avatarOf: (id: number) => Avatar | null): void {
    this.self = self;
    if (!this.active || !this.enabled) return;
    const seat = this.activeSeat;
    this.fishing.update(dt, time, this.seats.map((id) => id ? avatarOf(id) : null));
    this.effects.update(dt); this.fx.update(dt); this.models.update(dt, time, this.collision, camera, self);
    this.hud.frame(seat !== null, this.d.input.isHeld(BTN_FIRE) || this.d.input.isHeld(BTN_JUMP), this.fishing, seat ?? -1, self?.x ?? null, self?.z ?? null);
    if (seat !== null) {
      const phase = this.fishing.phaseOf(seat);
      this.hud.prompt(this.hud.bagFull ? 'full' : phase === FP_IDLE || phase === FP_HOLD ? 'idle' : phase === FP_CAST ? 'cast' : 'wait');
    }
  }

  onUse(mouse: boolean): boolean {
    if (!this.active || !this.enabled || !this.self) return false;
    if (this.hud.modalOpen) return true;
    const seat = this.activeSeat;
    if (seat !== null) {
      if (!mouse) this.d.net.send({ t: 'farmPondSeat', epoch: this.epoch, seat: null });
      else this.press();
      return true;
    }
    if (Math.hypot(this.self.x - POND_USE.x, this.self.z - POND_USE.z) <= POND_USE.r) {
      this.hud.requestNpcOpen('pond'); return true;
    }
    let nearest = -1, distance = 1.65;
    POND_SPOTS.forEach((s, i) => { const d = Math.hypot(this.self!.x - s.x, this.self!.z - s.z); if (d < distance && !this.seats[i]) { distance = d; nearest = i; } });
    if (nearest >= 0) { this.d.net.send({ t: 'farmPondSeat', epoch: this.epoch, seat: nearest }); return true; }
    if (this.nearHint) { this.d.ui.toasts.show('Все 6 мест заняты', 3000); return true; }
    return false;
  }

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (!this.active || !this.enabled) return false;
    if (code === 'KeyV') return false;
    if (!down || e.repeat) return false;
    if (code === 'KeyJ') { this.hud.toggleBook(); return true; }
    if (code === 'KeyI') { this.hud.toggleBag(); return true; }
    if (this.activeSeat === null) return false;
    if (code === 'KeyF' || code === 'Digit2') return this.hud.choose(false);
    if (code === 'Digit1') return this.hud.choose(true);
    if (code === 'KeyX') return this.hud.giveUp();
    if (code === 'Space') { if (this.hud.quickKeepSpace(e)) return true; this.press(); return true; }
    return false;
  }

  private press(): void {
    const seat = this.activeSeat;
    const now = performance.now();
    if (seat === null || now - this.sentAt < 250 || this.hud.inputLocked || this.hud.choosing) return;
    const phase = this.fishing.phaseOf(seat);
    if (phase === FP_IDLE || phase === FP_HOLD) {
      if (this.hud.bagFull) { this.d.ui.toasts.show(this.hud.fullHint, 3500); return; }
      if (phase === FP_IDLE && !this.fishing.castLocal(seat)) return;
      this.send({ t: 'fish', a: 'cast' }); this.hud.cast();
    } else if (phase === FP_WAIT || phase === FP_BITE) {
      this.fishing.jerk(seat); this.send({ t: 'fish', a: 'hook', n: this.fishing.lastN(seat) });
    } else return;
    this.sentAt = now;
  }
}

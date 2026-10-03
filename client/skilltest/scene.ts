import * as THREE from 'three';
import { cameraRig, RIG_LOBBY } from '../../shared/aim.ts';
import { viewDir } from '../../shared/math.ts';
import { quantTick } from '../../shared/aquadyn.ts';
import { E_ALIVE, E_GROUNDED, encodeInputs } from '../../shared/protocol.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { SKILL_COURSE, SKILL_SECTIONS, skillMedal, skillTime, type SkillPeer, type SkillProgress } from '../../shared/skilltest.ts';
import { SkillDynamics } from '../../shared/skillphysics.ts';
import { makeInput } from '../../shared/sim.ts';
import { Predictor } from '../predict.ts';
import { Avatar, tickAvatarShared, type AvatarPose } from '../render/avatar.ts';
import type { Scene, SceneDeps } from '../scene.ts';
import type { Quality } from '../settings.ts';
import { SkillWorld, SHIPYARD_STAGES } from './world.ts';
import './skilltest.css';

export class SkillScene implements Scene {
  readonly kind = 'skill' as const;
  readonly wantsPointer = true;
  readonly touchMode = 'walk' as const;
  readonly touchUseIcon = '↩';
  readonly world: SkillWorld;
  private readonly d: SceneDeps;
  private predictor: Predictor;
  private readonly dynamics: SkillDynamics;
  private readonly root: HTMLDivElement;
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly score: HTMLElement;
  private readonly peersText: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly avatars = new Map<number, Avatar>();
  private readonly poses = new Map<number, AvatarPose>();
  private peers: SkillPeer[] = [];
  private progress: SkillProgress = { checkpoint: 0, startedAt: null, finishedAt: null, falls: 0, run: 1 };
  private active = false;
  private ready = false;
  private myId = 0;
  private reset = -1;
  private seq = 0;
  private acc = 0;
  private tick = 0;
  private receivedAt = 0;
  private viewTick = 0;
  private hudAt = 0;
  private readonly inputs = [makeInput()];
  private readonly cameraPos = new THREE.Vector3();
  private readonly cameraLook = new THREE.Vector3();
  private readonly cameraDir = new THREE.Vector3();
  constructor(d: SceneDeps) {
    this.d = d; this.world = new SkillWorld(d.renderer);
    this.dynamics = new SkillDynamics(this.world.map, this.world.collision);
    this.predictor = new Predictor(this.world.collision, this.dynamics);
    this.root = document.createElement('div'); this.root.className = 'skill-hud'; this.root.hidden = true;
    const panel = document.createElement('section'); panel.className = 'skill-panel'; panel.setAttribute('aria-label', 'Высотная верфь');
    const eyebrow = document.createElement('div'); eyebrow.className = 'skill-eyebrow'; eyebrow.textContent = 'ВЫСОТНАЯ ВЕРФЬ · ПОЛОСА МАСТЕРСТВА';
    this.title = document.createElement('h2'); this.hint = document.createElement('p'); this.score = document.createElement('div'); this.score.className = 'skill-score';
    this.peersText = document.createElement('p'); this.peersText.className = 'skill-peers';
    this.notice = document.createElement('p'); this.notice.className = 'skill-notice'; this.notice.setAttribute('role', 'status'); this.notice.setAttribute('aria-live', 'polite');
    panel.append(eyebrow, this.title, this.hint, this.score, this.peersText, this.notice);
    const controls = document.createElement('div'); controls.className = 'skill-controls';
    for (const [label, action] of [['К точке · R', () => d.net.send({ t: 'use', id: 1 })], ['Сначала · N', () => d.net.send({ t: 'use', id: 0 })], ['На набережную', () => d.net.send({ t: 'leave' })]] as const) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', action); controls.appendChild(b);
    }
    const help = document.createElement('p'); help.className = 'skill-help'; help.textContent = 'WASD — движение · Пробел — прыжок · Shift — рывок · R — к точке · N — сначала';
    this.root.append(panel, controls, help); d.hudRoot.appendChild(this.root);
    this.world.setQuality(d.settings.quality);
  }
  enter(): void {
    this.active = true; this.ready = false; this.myId = 0; this.reset = -1; this.seq = 0; this.acc = 0; this.viewTick = 0;
    this.predictor = new Predictor(this.world.collision, this.dynamics);
    this.root.hidden = false; this.d.input.yaw = -Math.PI / 2; this.d.input.pitch = -0.25;
    this.notice.textContent = 'Дойди до восьми контрольных точек. Падение возвращает на последнюю.';
    this.title.textContent = 'Высотная верфь'; this.hint.textContent = 'Подключаемся к полосе…'; this.score.textContent = ''; this.peersText.textContent = '';
  }
  exit(): void {
    this.active = false; this.ready = false; this.root.hidden = true;
    for (const a of this.avatars.values()) a.dispose(this.world.scene);
    this.avatars.clear(); this.poses.clear(); this.peers = [];
  }
  setQuality(q: Quality, slow = false): void { this.world.setQuality(q, slow); }
  onJson(msg: ServerMsg): void {
    if (!this.active || msg.t !== 'skill_state' || msg.course !== SKILL_COURSE) return;
    const old = this.progress;
    this.myId = msg.id; this.tick = msg.tick; this.receivedAt = performance.now();
    if (!this.ready || this.reset !== msg.reset) { this.predictor.reset(msg.state, msg.ack); this.reset = msg.reset; }
    else this.predictor.reconcile(msg.ack, msg.state);
    if (this.ready) {
      if (msg.progress.run !== old.run) this.notice.textContent = 'Новая попытка. Таймер начнётся за стартовым островом.';
      else if (msg.progress.finishedAt !== null && old.finishedAt === null) this.notice.textContent = `Финиш! ${skillMedal(msg.progress.finishedAt - (msg.progress.startedAt ?? msg.progress.finishedAt), msg.progress.falls)}. Можно дождаться друзей или начать снова.`;
      else if (msg.progress.checkpoint > old.checkpoint) this.notice.textContent = `Точка ${msg.progress.checkpoint} сохранена. Теперь падение вернёт сюда.`;
      else if (msg.progress.falls > old.falls) this.notice.textContent = 'Снова на контрольной точке. Таймер продолжается.';
    }
    this.progress = msg.progress; this.peers = msg.peers; this.ready = true;
    const ids = new Set(msg.peers.map(p => p.id));
    for (const [id, a] of this.avatars) if (!ids.has(id)) { a.dispose(this.world.scene); this.avatars.delete(id); this.poses.delete(id); }
    for (const p of msg.peers) {
      let a = this.avatars.get(p.id);
      if (!a) { a = new Avatar(p.id); a.addTo(this.world.scene); this.avatars.set(p.id, a); this.poses.set(p.id, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: 0, flags: E_ALIVE }); }
      a.setInfo(p.nick, null, false, p.level); a.setOutfit(p.outfit);
    }
  }
  onSnapshot(_buf: ArrayBuffer, _at: number): void {}
  frame(now: number, dt: number): void {
    if (!this.active) return;
    if (!this.ready) { this.world.camera.position.set(-7, 46, 9); this.world.camera.lookAt(15, 40, 0); this.world.render(); return; }
    // Clamp extrapolation after silence. Input viewTick is advisory; server clamps it again.
    const estimated = this.tick + Math.min(12, Math.max(0, (now - this.receivedAt) * 0.06)) - 6;
    this.viewTick = Math.max(this.viewTick, quantTick(Math.max(0, estimated)));
    // Constrain the accumulated angle too: reversing at the limit must move the view immediately.
    this.d.input.pitch = Math.max(-0.6, Math.min(0.85, this.d.input.pitch));
    this.acc = Math.min(0.15, this.acc + dt);
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      const inp = this.inputs[0]; inp.seq = ++this.seq; inp.buttons = this.d.input.sample(); inp.yaw = Math.fround(this.d.input.yaw); inp.pitch = Math.fround(this.d.input.pitch); inp.viewTick = this.viewTick;
      const ev = this.predictor.step(inp, false);
      if (ev.jumped) this.d.sound.jump(); if (ev.landed && ev.landSpeed > 2) this.d.sound.land(Math.min(1, ev.landSpeed / 12));
      this.d.net.sendBinary(encodeInputs(this.inputs, 0, 1, this.d.net.epoch));
    }
    this.predictor.decay(dt);
    const s = this.predictor.state, off = this.predictor.offset;
    const pos = this.cameraPos.set(s.x + off.x, s.y + off.y, s.z + off.z);
    const yaw = this.d.input.yaw, pitch = this.d.input.pitch;
    // Same positive-pitch-up convention and wall retraction as the established lobby camera.
    // Place moving collision boxes at the rendered tick before testing the camera arm.
    this.dynamics.place(this.viewTick);
    cameraRig(pos.x, pos.y, pos.z, yaw, pitch, RIG_LOBBY, 0, this.world.collision, this.world.camera.position, 6);
    viewDir(yaw, pitch, this.cameraDir);
    this.world.camera.lookAt(this.cameraLook.copy(this.cameraDir).add(this.world.camera.position));
    this.world.update(this.viewTick, this.progress.checkpoint);
    tickAvatarShared(now / 1000, this.d.renderer.canvas.clientHeight || window.innerHeight);
    for (const p of this.peers) {
      const pose = this.poses.get(p.id)!, local = p.id === this.myId;
      const target = local ? pos : p;
      const snap = Math.hypot(pose.x - target.x, pose.y - target.y, pose.z - target.z) > 8;
      const blend = local || snap ? 1 : 1 - Math.exp(-dt * 16);
      pose.x += (target.x - pose.x) * blend; pose.y += (target.y - pose.y) * blend; pose.z += (target.z - pose.z) * blend;
      pose.yaw = local ? yaw : p.yaw; pose.flags = E_ALIVE | ((local ? s.grounded : p.grounded) ? E_GROUNDED : 0);
      this.avatars.get(p.id)!.setLevel(local ? this.d.ui.me().level : p.level);
      this.avatars.get(p.id)!.update(pose, dt, now / 1000, this.world.collision, this.world.camera.position, local);
    }
    if (now - this.hudAt > 100) { this.hudAt = now; this.updateHud(); }
    this.world.render();
  }
  private updateHud(): void {
    const p = this.progress, section = SKILL_SECTIONS[Math.min(p.checkpoint, 7)];
    this.title.textContent = p.finishedAt !== null ? 'Верфь пройдена' : `${p.checkpoint + 1}/8 · ${SHIPYARD_STAGES[Math.min(p.checkpoint, 7)]}`;
    this.hint.textContent = p.finishedAt !== null ? 'Друзья могут закончить в своём темпе' : section.hint;
    const elapsed = p.startedAt === null ? 0 : (p.finishedAt ?? this.tick) - p.startedAt;
    this.score.textContent = `${skillTime(elapsed)}  ·  Падения: ${p.falls}  ·  Точки: ${p.checkpoint}/8`;
    this.peersText.textContent = this.peers.map(x => `${x.nick}: ${x.finished ? '✓ финиш' : `${x.checkpoint}/8`}`).join('  ·  ');
  }
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (!down || e.repeat || this.d.input.blocked) return false;
    if (code === 'KeyR' || code === 'KeyN') { this.d.net.send({ t: 'use', id: code === 'KeyR' ? 1 : 0 }); return true; }
    return false;
  }
  onUse(mouse: boolean): void { if (!mouse) this.d.net.send({ t: 'use', id: 1 }); }
  resize(w: number, h: number): void { this.world.resize(w, h); }
  debugState(): Record<string, unknown> { return { mode: 'skill', course: SKILL_COURSE, ready: this.ready, tick: this.tick, id: this.myId, player: { x: this.predictor.state.x, y: this.predictor.state.y, z: this.predictor.state.z }, progress: { ...this.progress }, peers: this.peers.length, corrections: this.predictor.corrections, boxes: this.world.map.boxes.length, hazards: this.world.map.hazards.length }; }
}

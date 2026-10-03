import * as THREE from 'three';
import { BR_COURSE, BR_LAPS, type BoatRacePeer, type BoatRacePhase, type BoatRaceResultRow } from '../../shared/boatrace.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { encodeInputs } from '../../shared/protocol.ts';
import { makeInput } from '../../shared/sim.ts';
import type { Scene, SceneDeps } from '../scene.ts';
import type { Quality } from '../settings.ts';
import type { TouchMode } from '../touch.ts';
import { BoatPredictor } from './predict.ts';
import { BoatModel, BoatRaceWorld } from './world.ts';
import './boatrace.css';
function time(ticks: number): string { const s = Math.max(0, ticks) / 60; return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`; }
export class BoatRaceScene implements Scene {
  readonly kind = 'boatrace' as const; readonly wantsPointer = true; readonly world: BoatRaceWorld;
  private readonly d: SceneDeps; private predictor: BoatPredictor;
  private readonly root: HTMLDivElement; private readonly phaseText: HTMLElement; private readonly stats: HTMLElement; private readonly board: HTMLElement;
  private readonly hint: HTMLElement; private readonly result: HTMLElement; private readonly nitro: HTMLButtonElement; private readonly count: HTMLElement;
  private readonly models = new Map<number, BoatModel>(); private readonly poses = new Map<number, { x: number; z: number; hx: number; hz: number }>();
  private peers: BoatRacePeer[] = []; private active = false; private ready = false; private myId = 0; private phase: BoatRacePhase = 'grid';
  private seq = 0; private acc = 0; private tick = 0; private at = 0; private phaseEnd = 0; private reset = -1; private raceStart = 0; private bestLap = 0; private hudAt = 0;
  private finishTicks: number | null = null; private lastBeep = -1; private lastHit = -999;
  private readonly inputs = [makeInput()]; private readonly camPos = new THREE.Vector3(); private camReady = false;
  constructor(d: SceneDeps) {
    this.d = d; this.world = new BoatRaceWorld(d.renderer); this.predictor = new BoatPredictor(this.world.course);
    this.root = document.createElement('div'); this.root.className = 'br-hud'; this.root.hidden = true;
    const panel = document.createElement('section'); panel.className = 'br-panel';
    const eyebrow = document.createElement('div'); eyebrow.className = 'br-eyebrow'; eyebrow.textContent = 'ЛАЗУРНЫЙ КРУГ · ГОНКИ В БУХТЕ';
    this.phaseText = document.createElement('h2'); this.stats = document.createElement('div'); this.stats.className = 'br-stats';
    this.hint = document.createElement('p'); this.board = document.createElement('div'); this.board.className = 'br-board';
    panel.append(eyebrow, this.phaseText, this.stats, this.hint, this.board);
    this.count = document.createElement('div'); this.count.className = 'br-count'; this.count.setAttribute('aria-live', 'polite');
    this.result = document.createElement('section'); this.result.className = 'br-results'; this.result.hidden = true; this.result.setAttribute('aria-live', 'polite');
    const controls = document.createElement('div'); controls.className = 'br-controls';
    this.nitro = document.createElement('button'); this.nitro.textContent = 'Нитро · E'; this.nitro.type = 'button'; this.nitro.onclick = () => { d.input.tap('KeyE', true); d.input.tap('KeyE', false); };
    const recover = document.createElement('button'); recover.type = 'button'; recover.textContent = 'К последним буям · R'; recover.onclick = () => d.net.send({ t: 'use', id: 0 });
    const leave = document.createElement('button'); leave.type = 'button'; leave.textContent = 'На набережную'; leave.onclick = () => d.net.send({ t: 'leave' }); controls.append(this.nitro, recover, leave);
    const help = document.createElement('p'); help.className = 'br-help'; help.textContent = 'W — газ · S — тормоз / назад · A/D — руль · E/ЛКМ — нитро · R — к буям';
    this.root.append(panel, this.count, this.result, controls, help); d.hudRoot.appendChild(this.root); this.world.setQuality(d.settings.quality);
  }
  get touchMode(): TouchMode { return this.phase === 'results' ? 'none' : 'kart'; }
  setQuality(q: Quality, slow = false): void { this.world.setQuality(q, slow); }
  enter(): void {
    this.active = true; this.ready = false; this.seq = 0; this.acc = 0; this.reset = -1; this.camReady = false; this.myId = 0; this.phase = 'grid';
    this.predictor = new BoatPredictor(this.world.course); this.lastBeep = -1; this.finishTicks = null; this.root.hidden = false; this.result.hidden = true; this.result.replaceChildren(); this.count.textContent = '';
    this.phaseText.textContent = 'На стартовой воде'; this.hint.textContent = 'Три круга. Проходи подсвеченные ворота между буями по порядку.'; this.stats.textContent = ''; this.board.textContent = '';
  }
  exit(): void { this.active = this.ready = false; this.root.hidden = true; for (const m of this.models.values()) m.dispose(this.world.scene); this.models.clear(); this.poses.clear(); this.peers = []; this.d.sound.enginesOff(); }
  onJson(msg: ServerMsg): void {
    if (!this.active) return;
    if (msg.t === 'brState' && msg.course === BR_COURSE) {
      if (this.phase === 'grid' && msg.phase === 'race') this.d.sound.countBeep(true);
      this.myId = msg.id; this.tick = msg.tick; this.at = performance.now(); this.phase = msg.phase; this.phaseEnd = msg.phaseEnd; this.raceStart = msg.raceStart; this.bestLap = msg.bestLap;
      this.predictor.accept(msg.ack, msg.state, !this.ready || this.reset !== msg.reset); this.reset = msg.reset; this.ready = true; this.peers = msg.peers;
      const ids = new Set(msg.peers.map(p => p.id));
      for (const [id, m] of this.models) if (!ids.has(id)) { m.dispose(this.world.scene); this.d.sound.engineStop(id); this.models.delete(id); this.poses.delete(id); }
      for (const p of msg.peers) {
        let model = this.models.get(p.id);
        if (!model) { model = new BoatModel(this.world.scene, p.id, p.outfit, p.nick); this.models.set(p.id, model); this.poses.set(p.id, { x: p.x, z: p.z, hx: p.hx, hz: p.hz }); }
        model.outfit(p.outfit, p.nick); model.rider.setLevel(p.level);
      }
    } else if (msg.t === 'brEnd') { this.phase = 'results'; this.showResults(msg.results); }
    else if (msg.t === 'brReward') {
      if (msg.row.finished) this.finishTicks = msg.row.ticks;
      this.hint.textContent = msg.reward ? `Финиш! +${msg.reward.total} жетонов · ${time(msg.row.ticks)}. Ждём остальных.` : 'Заезд завершён. Награда — за самостоятельный финиш.';
    }
  }
  private showResults(rows: BoatRaceResultRow[]): void {
    this.result.hidden = false; this.result.replaceChildren(); const h = document.createElement('h2'); h.textContent = 'Бухта пройдена'; this.result.appendChild(h);
    for (const row of rows) { const p = document.createElement('p'); p.textContent = `${row.pos || '—'}. ${row.nick}${row.bot ? ' · бот' : ''}  ${row.finished ? time(row.ticks) : 'не финишировал'}`; if (row.id === this.myId) p.className = 'br-me'; this.result.appendChild(p); }
    const tip = document.createElement('p'); tip.textContent = 'Через несколько секунд — обратно на набережную'; tip.className = 'br-result-tip'; this.result.appendChild(tip);
  }
  onSnapshot(_buf: ArrayBuffer, _at: number): void {}
  frame(now: number, dt: number): void {
    if (!this.active) return;
    if (!this.ready) { const g = this.world.course.gates[0]; this.world.camera.position.set(g.x - 12, 12, g.z + 15); this.world.camera.lookAt(g.x, 1, g.z); this.world.render(); return; }
    const worldTick = this.tick + Math.min(12, Math.max(0, (now - this.at) * 0.06));
    this.acc = Math.min(0.15, this.acc + dt);
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60; const inp = this.inputs[0]; inp.seq = ++this.seq; inp.buttons = this.d.input.sample(); inp.yaw = 0; inp.pitch = 0; inp.viewTick = worldTick;
      this.predictor.step(inp, this.phase === 'race');
      const ev = this.predictor.events;
      if (ev.boost) this.d.sound.kartBoost(null, 3);
      if (ev.respawn) this.d.sound.splash(null);
      if (ev.hit > 2 && this.tick - this.lastHit > 15) { this.lastHit = this.tick; this.d.sound.kartBump(null, ev.hit); }
      this.d.net.sendBinary(encodeInputs(this.inputs, 0, 1, this.d.net.epoch));
    }
    this.predictor.decay(dt); const s = this.predictor.state, x = s.x + this.predictor.offset.x, z = s.z + this.predictor.offset.z, speed = Math.hypot(s.vx, s.vz);
    const desired = new THREE.Vector3(x - s.hx * (10 + speed * 0.08), 5.8 + speed * 0.018, z - s.hz * (10 + speed * 0.08));
    if (!this.camReady || this.camPos.distanceTo(desired) > 35) { this.camPos.copy(desired); this.camReady = true; } else this.camPos.lerp(desired, 1 - Math.exp(-dt * 7));
    this.d.sound.setListener(x, 1.5, z, s.hx, 0, s.hz);
    this.world.camera.position.copy(this.camPos); this.world.camera.lookAt(x + s.hx * 7, 0.75, z + s.hz * 7);
    const boats: Array<{ x: number; z: number; hx: number; hz: number; speed: number }> = [];
    for (const p of this.peers) {
      const pose = this.poses.get(p.id)!, local = p.id === this.myId, target = local ? { x, z, hx: s.hx, hz: s.hz } : p;
      const blend = local || Math.hypot(pose.x - target.x, pose.z - target.z) > 12 ? 1 : 1 - Math.exp(-dt * 17);
      pose.x += (target.x - pose.x) * blend; pose.z += (target.z - pose.z) * blend; pose.hx += (target.hx - pose.hx) * blend; pose.hz += (target.hz - pose.hz) * blend;
      const ps = local ? speed : p.speed; this.models.get(p.id)!.rider.setLevel(local ? this.d.ui.me().level : p.level); this.models.get(p.id)!.update(pose.x, pose.z, pose.hx, pose.hz, local ? s.steer : p.steer, ps, worldTick, dt, this.world.camera.position, local);
      if (!p.done && this.phase !== 'results') this.d.sound.engine(p.id, local ? null : [pose.x, 0.5, pose.z], ps, !!(local ? s.boost : p.boost), 0, local ? 0.3 : 0.18);
      else this.d.sound.engineStop(p.id);
      boats.push({ ...pose, speed: ps });
    }
    this.world.update(worldTick, s.lap === 0 ? 0 : (s.cp + 1) % this.world.course.gates.length, boats);
    if (now - this.hudAt >= 100) { this.hudAt = now; this.updateHud(worldTick); }
    this.world.render();
  }
  private updateHud(worldTick: number): void {
    const s = this.predictor.state, me = this.peers.find(p => p.id === this.myId);
    const left = Math.max(0, Math.ceil((this.phaseEnd - worldTick) / 60));
    if (this.phase === 'grid' && left > 0 && left !== this.lastBeep) { this.lastBeep = left; this.d.sound.countBeep(false); }
    this.count.textContent = this.phase === 'grid' ? left ? String(left) : 'СТАРТ' : '';
    this.phaseText.textContent = this.phase === 'grid' ? 'Приготовься к старту' : this.phase === 'results' ? 'Итоги заезда' : s.done ? 'Финиш!' : `Место ${me?.pos ?? 1}/${this.peers.length} · Круг ${Math.max(1, s.lap)}/${BR_LAPS}`;
    this.stats.textContent = `${Math.round(Math.hypot(s.vx, s.vz) * 3.6)} км/ч · ${time(this.finishTicks ?? Math.max(0, this.tick - this.raceStart))}${this.bestLap ? ` · Лучший ${time(this.bestLap)}` : ''}`;
    if (!s.done && this.phase === 'race') this.hint.textContent = s.off ? 'Вне трассы — вернись к буям. R: безопасный возврат.' : `Следующие ворота: ${s.lap === 0 ? 'старт' : (s.cp + 1) % this.world.course.gates.length || 'финиш круга'} · Золотые кольца дают нитро`;
    this.nitro.disabled = !s.nitro || this.phase !== 'race' || !!s.done; this.nitro.textContent = s.boost ? 'Нитро работает' : s.nitro ? 'Нитро готово · E' : 'Нитро · найди кольцо';
    this.board.replaceChildren();
    for (const p of [...this.peers].sort((a, b) => a.pos - b.pos)) { const row = document.createElement('div'); row.className = p.id === this.myId ? 'br-me' : ''; row.textContent = `${p.pos}. ${p.nick}${p.bot ? ' · бот' : ''} ${p.done ? '✓' : `· ${Math.max(1, p.lap)}/3`}`; this.board.appendChild(row); }
  }
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean { if (code !== 'KeyR' || !down || e.repeat || this.d.input.blocked) return false; this.d.net.send({ t: 'use', id: 0 }); return true; }
  onUse(_mouse: boolean): void { /* E/ЛКМ are sampled through the common binary input. */ }
  resize(w: number, h: number): void { this.world.resize(w, h); }
  debugState(): Record<string, unknown> { return { mode: 'boatrace', course: BR_COURSE, ready: this.ready, id: this.myId, phase: this.phase, tick: this.tick, state: { ...this.predictor.state }, peers: this.peers.length, corrections: this.predictor.corrections }; }
}

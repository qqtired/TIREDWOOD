// «Выше облаков» на клиенте: Небесная каланча. Шаг предсказывается той же физикой, что на сервере (SkillDynamics:
// люльки, тележка, облака, ветер, ловушки), камера — за спиной; забег — сбор, отсчёт 3-2-1, места и итоги;
// звуки и эффекты ловушек рядом с игроком, высотомер с соперниками, карточка финиша и колокол для всех.
import * as THREE from 'three';
import { quantTick } from '../../shared/aquadyn.ts';
import { TAU, clamp } from '../../shared/math.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import { E_ALIVE, E_GROUNDED, encodeInputs } from '../../shared/protocol.ts';
import { makeInput, type StepEvents } from '../../shared/sim.ts';
import { SKILL_KNOCK_TICKS, SkillDynamics, makeSackPose, moverAt, sackAt, type P3 } from '../../shared/skillphysics.ts';
import {
  SKILL_COUNT_TICKS, SKILL_COURSE, SKILL_GOLD_TICKS, SKILL_MEDALS, SKILL_SECTIONS, SKILL_SILVER_TICKS, makeSkillProgress, skillClock,
  skillMedal, skillTime, type SkillPeer, type SkillProgress, type SkillRaceView, type SkillServerMsg,
} from '../../shared/skilltest.ts';
import { CRUMBLE_SPEED, crumbleFront, crumbleReformIn, ramState, windState, type RamPhase } from '../../shared/skilltraps.ts';
import { ClockSync } from '../net.ts';
import { Predictor } from '../predict.ts';
import { Avatar, tickAvatarShared, type AvatarPose } from '../render/avatar.ts';
import type { Scene, SceneDeps } from '../scene.ts';
import type { Quality } from '../settings.ts';
import { SkillCamera, skyVfov } from './camera.ts';
import { SkillFx } from './fx.ts';
import { SkillHud, type MeterMark } from './hud.ts';
import { SkillSfx } from './sfx.ts';
import { SkillWorld } from './world.ts';

type StateMsg = Extract<SkillServerMsg, { t: 'skill_state' }>;
type V3 = [number, number, number];

/** Положение чужого в его времени подвижного (vt — метка его входа) */
interface PeerSample { t: number; x: number; y: number; z: number; yaw: number; g: number }
/** История чужого и на сколько тиков его время отстаёт от тика сервера (сглажено) */
interface PeerTrack { s: PeerSample[]; lag: number }

/** Состояние приходит раз в 6 тиков: часы отрисовки держим позади хотя бы на столько, плюс запас на дрожание сети */
const MIN_DELAY = 7.5;
const STEP = 1 / 60;

/** Сбитый кувыркается столько секунд (сальто вокруг середины тела) */
const TUMBLE_S = 0.7;
const MEDAL_CLASS = ['', 'bronze', 'silver', 'gold'] as const;
const PITCH_MIN = -0.6;
const PITCH_MAX = 0.85;

const noRace = (): SkillRaceView => ({ id: 0, phase: 'none', phaseEnd: 0, start: 0, racers: 0, rows: [] });

/** Кто выше в забеге: дошедшие — по времени, остальные — по точке и высоте. */
function byPlace(a: SkillPeer, b: SkillPeer): number {
  if (a.finished !== b.finished) return a.finished ? -1 : 1;
  if (a.finished) return a.ticks - b.ticks;
  return b.checkpoint - a.checkpoint || b.y - a.y;
}

export class SkillScene implements Scene {
  readonly kind = 'skill' as const;
  readonly wantsPointer = true;
  readonly touchMode = 'walk' as const;
  readonly touchUseIcon = '⟳';
  readonly world: SkillWorld;
  private readonly d: SceneDeps;
  private predictor: Predictor;
  private readonly dynamics: SkillDynamics;
  private readonly cam = new SkillCamera();
  private readonly fx: SkillFx;
  private readonly sfx: SkillSfx;
  private readonly hud: SkillHud;
  private readonly avatars = new Map<number, Avatar>();
  private readonly poses = new Map<number, AvatarPose>();
  private readonly tumbles = new Map<number, { t: number; last: number }>();
  private peers: SkillPeer[] = [];
  private progress: SkillProgress = makeSkillProgress();
  private race: SkillRaceView = noRace();
  /** Личный рекорд, мс */
  private best = 0;
  /** Я в забеге и тики, до которых кнопки не действуют (сбор и отсчёт) */
  private racer = false;
  private lock = 0;
  private active = false;
  private ready = false;
  private myId = 0;
  private reset = -1;
  private seq = 0;
  private acc = 0;
  private tick = 0;
  /** Время картинки (тики с дробью): подвижное и своя желейка — между двумя последними шагами */
  private viewTick = 0;
  /** Часы отрисовки по приходу состояний (как на набережной): идут ровно, без рывков от сети */
  private clock = new ClockSync(MIN_DELAY);
  /** Метки двух последних входов и последняя отправленная */
  private vt0 = 0;
  private vt1 = 0;
  private lastVt = 0;
  private readonly tracks = new Map<number, PeerTrack>();
  private readonly peerPose: PeerSample = { t: 0, x: 0, y: 0, z: 0, yaw: 0, g: 0 };
  private readonly mp0: P3 = { x: 0, y: 0, z: 0 };
  private readonly mp1: P3 = { x: 0, y: 0, z: 0 };
  private hudAt = 0;
  private shake = 0;
  private countText = '';
  /** Когда сервер последний раз отодвинул старт (кто-то ещё грузится) */
  private waitingAt = -1e9;
  private cardUntil = 0;
  private confirmAt = 0;
  private quietUntil = 0;
  private crumbleAt = 0;
  private reformWas = false;
  private windWas = 0;
  private gust = 0;
  private readonly sackWas: number[] = [];
  private readonly ramWas: RamPhase[] = [];
  private readonly sackPose = makeSackPose();
  private readonly ramTmp: { e: number; phase: RamPhase; k: number } = { e: 0, phase: 'rest', k: 0 };
  private readonly inputs = [makeInput()];
  private readonly cameraPos = new THREE.Vector3();
  private readonly cameraDir = new THREE.Vector3();
  /** Снимок для отчёта (из консоли): камера стоит здесь и смотрит туда */
  private photo: [number, number, number, number, number, number] | null = null;
  private readonly pivot = new THREE.Vector3();
  private readonly turned = new THREE.Vector3();

  constructor(d: SceneDeps) {
    this.d = d;
    this.world = new SkillWorld(d.renderer);
    this.dynamics = new SkillDynamics(this.world.map, this.world.collision);
    this.predictor = new Predictor(this.world.collision, this.dynamics);
    this.fx = new SkillFx(this.world.scene);
    this.sfx = new SkillSfx(d.sound);
    this.hud = new SkillHud(d.hudRoot, {
      respawn: () => this.use(1),
      restart: () => this.use(0),
      again: () => this.again(),
      leave: () => d.net.send({ t: 'leave' }),
    });
    this.world.onPuff = (x, y, z, kind) => this.puff(x, y, z, kind);
    this.world.setQuality(d.settings.quality);
    window.addEventListener('wheel', (e) => {
      if (this.active && d.input.locked && !d.input.blocked) this.cam.zoomBy(e.deltaY);
    }, { passive: true });
  }

  enter(): void {
    this.active = true;
    this.ready = false;
    this.myId = 0;
    this.reset = -1;
    this.seq = 0;
    this.acc = 0;
    this.viewTick = 0;
    this.clock = new ClockSync(MIN_DELAY);
    this.vt0 = this.vt1 = this.lastVt = 0;
    this.tracks.clear();
    this.lock = 0;
    this.racer = false;
    this.race = noRace();
    this.progress = makeSkillProgress();
    this.best = 0;
    this.countText = '';
    this.cardUntil = 0;
    this.shake = 0;
    this.windWas = 0;
    this.gust = 0;
    this.reformWas = false;
    this.sackWas.length = 0;
    this.ramWas.length = 0;
    this.quietUntil = performance.now() + 800;
    this.predictor = new Predictor(this.world.collision, this.dynamics);
    this.cam.reset();
    this.hud.show(true);
    this.hud.notice('Небесная каланча: доберись до колокола на самой верхушке!', 3500);
    this.d.input.yaw = -Math.PI / 2;
    this.d.input.pitch = -0.18;
  }

  exit(): void {
    this.active = false;
    this.ready = false;
    this.hud.show(false);
    this.sfx.stop();
    this.fx.clear();
    for (const a of this.avatars.values()) a.dispose(this.world.scene);
    this.avatars.clear();
    this.poses.clear();
    this.tumbles.clear();
    this.peers = [];
  }

  setQuality(q: Quality, slow = false): void {
    this.world.setQuality(q, slow);
  }

  onJson(msg: ServerMsg): void {
    if (!this.active) return;
    if (msg.t === 'skill_state') {
      if (msg.course === SKILL_COURSE) this.onState(msg);
    } else if (msg.t === 'skill_finish') {
      this.hud.finish(msg, this.d.ui.me().nick, '');
      this.cardUntil = performance.now() + 9000;
      this.sfx.fanfare();
      const b = this.world.map.bell;
      this.fx.confetti((b.x0 + b.x1) / 2, b.y0 + 0.5, (b.z0 + b.z1) / 2, 160);
      this.world.ringBell(1.6);
    } else if (msg.t === 'skill_bell') {
      const mine = msg.pid === this.d.ui.me().pid;
      const b = this.world.map.bell;
      // колокол слышат все в комнате: свой — над головой, чужой — издалека, но отчётливо
      this.sfx.bell(mine ? [(b.x0 + b.x1) / 2, b.y0 + 1, (b.z0 + b.z1) / 2] : null, mine);
      if (!mine) {
        this.world.ringBell(msg.first ? 1.4 : 1);
        this.hud.notice(msg.first ? `${msg.nick} первым позвонил в колокол — ${skillClock(msg.ticks)}!` : `${msg.nick} позвонил в колокол — ${skillClock(msg.ticks)}`, 4000);
        if (msg.first) this.fx.confetti((b.x0 + b.x1) / 2, b.y0 + 0.5, (b.z0 + b.z1) / 2, 90);
      }
    }
  }

  private onState(msg: StateMsg): void {
    const old = this.progress;
    const oldRace = this.race;
    const first = !this.ready;
    this.myId = msg.id;
    this.tick = msg.tick;
    this.clock.addSample(msg.tick, performance.now());
    this.trackPeers(msg);
    this.racer = msg.peers.some((p) => p.id === msg.id && p.racer);
    this.race = msg.race;
    this.best = msg.best;
    this.lock = this.racer && msg.race.phase === 'pre' ? msg.race.phaseEnd : this.racer && msg.race.phase === 'run' ? msg.race.start : 0;
    if (first || this.reset !== msg.reset) {
      this.predictor.reset(msg.state, msg.ack);
      this.reset = msg.reset;
      // после возврата (упал, R, новый забег) — лицом по трассе
      this.d.input.yaw = this.world.map.checkpoints[msg.progress.checkpoint].yaw;
      this.d.input.pitch = -0.18;
      this.cam.reset();
    } else this.predictor.reconcile(msg.ack, msg.state);
    const p = msg.progress;
    if (first) {
      this.hud.notice(
        this.racer && msg.race.phase === 'pre' ? 'Забег! Стой на старте — сейчас отсчёт'
          : msg.race.phase === 'run' && !this.racer ? 'Забег уже идёт — лезь со своим временем: рекорд и медаль считаются'
            : 'Звони в колокол на верхушке! Сорвался — вернёшься к последнему флажку', 4000);
    } else if (p.run !== old.run) {
      this.hud.hideFinish();
      this.cardUntil = 0;
      this.hud.notice(this.racer && msg.race.phase === 'pre' ? 'На старте! Ждём отсчёт' : 'Новая попытка — время пойдёт, как сойдёшь с крыши');
    } else if (p.checkpoint > old.checkpoint) {
      const cp = this.world.map.checkpoints[p.checkpoint];
      this.sfx.checkpoint();
      this.fx.sparkle(cp.x1 - 0.35, cp.y + 3.35, cp.z0 + 0.35);
      this.hud.notice(`Флажок ${p.checkpoint}: «${SKILL_SECTIONS[Math.min(p.checkpoint, SKILL_SECTIONS.length - 1)].name}» — падение вернёт сюда`);
    } else if (p.falls > old.falls) {
      this.sfx.fall();
      this.hud.notice('Сорвался — снова у флажка. Время идёт');
    }
    if (!first && msg.race.phase === 'pre') {
      if (oldRace.id === msg.race.id && oldRace.phase === 'pre' && msg.race.phaseEnd > oldRace.phaseEnd) this.waitingAt = performance.now();
      if (oldRace.id !== msg.race.id && !this.racer) this.hud.notice('Друзья собирают забег — E, чтобы встать на старт', 4000);
    }
    this.progress = p;
    this.peers = msg.peers;
    this.ready = true;
    const ids = new Set(msg.peers.map((q) => q.id));
    for (const [id, a] of this.avatars) {
      if (ids.has(id)) continue;
      a.dispose(this.world.scene);
      this.avatars.delete(id);
      this.poses.delete(id);
      this.tumbles.delete(id);
    }
    for (const q of msg.peers) {
      let a = this.avatars.get(q.id);
      if (!a) {
        a = new Avatar(q.id);
        a.addTo(this.world.scene);
        a.root.rotation.order = 'YXZ';
        this.avatars.set(q.id, a);
        this.poses.set(q.id, { x: q.x, y: q.y, z: q.z, yaw: q.yaw, pitch: 0, flags: E_ALIVE });
      }
      a.setInfo(q.nick, null, false, q.level);
      a.setOutfit(q.outfit);
    }
  }

  onSnapshot(_buf: ArrayBuffer, _at: number): void {}

  frame(now: number, dt: number): void {
    if (!this.active) return;
    const cam = this.world.camera;
    if (!this.ready || !this.clock.ready) {
      cam.position.set(-30, 14, 30);
      cam.lookAt(0, 30, 0);
      this.world.render();
      return;
    }
    // Часы мира идут ровно (ClockSync); метка входа — подсказка, сервер её зажмёт ещё раз.
    this.clock.update(now, dt * 1000);
    const input = this.d.input;
    // Зажимаем и накопленный угол: развернуть взгляд от предела можно сразу.
    input.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, input.pitch));
    this.dynamics.lockUntil = this.lock;
    this.acc = Math.min(0.15, this.acc + dt);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      const inp = this.inputs[0];
      inp.seq = ++this.seq;
      inp.buttons = input.sample();
      inp.yaw = Math.fround(input.yaw);
      inp.pitch = Math.fround(input.pitch);
      // время шага — часы на момент этого шага: шаги ровно через тик, площадка под ногами едет без рывков
      const vt = quantTick(Math.max(0, this.clock.renderTick - this.acc * 60));
      inp.viewTick = vt > this.lastVt ? vt : this.lastVt;
      this.lastVt = inp.viewTick;
      this.vt0 = this.vt1 > 0 ? this.vt1 : inp.viewTick;
      this.vt1 = inp.viewTick;
      this.stepFx(this.predictor.step(inp, false));
      this.d.net.sendBinary(encodeInputs(this.inputs, 0, 1, this.d.net.epoch));
    }
    // картинка — между двумя последними шагами: своя желейка и всё подвижное в одном и том же времени
    const alpha = Math.min(1, this.acc * 60);
    this.viewTick = this.vt1 > 0 ? this.vt0 + (this.vt1 - this.vt0) * alpha : Math.max(0, this.clock.renderTick);
    this.predictor.decay(dt);
    const s = this.predictor.state, pr = this.predictor.prev, off = this.predictor.offset;
    const pos = this.cameraPos.set(pr.x + (s.x - pr.x) * alpha + off.x, pr.y + (s.y - pr.y) * alpha + off.y, pr.z + (s.z - pr.z) * alpha + off.z);
    // подвижные боксы — на время картинки, тогда и камера не проходит сквозь люльку
    this.dynamics.place(this.viewTick);
    this.cam.follow(cam, dt, pos.x, pos.y, pos.z, input.yaw, input.pitch, this.world.collision, skyVfov(this.d.settings.fov));
    if (this.photo) {
      cam.position.set(this.photo[0], this.photo[1], this.photo[2]);
      cam.lookAt(this.photo[3], this.photo[4], this.photo[5]);
    }
    this.world.update(this.viewTick, this.progress.checkpoint, dt, this.predictor.state);
    this.decor(now, dt);
    this.world.render();
  }

  /** Звук и картинка шага своего игрока. */
  private stepFx(ev: StepEvents): void {
    if (ev.jumped) this.d.sound.jump();
    if (ev.dashed) this.d.sound.dash();
    if (ev.landed && ev.landSpeed > 2) this.d.sound.land(Math.min(1, ev.landSpeed / 12));
    if (ev.bounced) {
      const s = this.predictor.state;
      const box = this.world.bouncerUnder(s.x, s.y, s.z);
      if (box >= 0) this.world.squashAt(box);
      this.fx.boing(s.x, s.y, s.z);
      this.sfx.boing(null);
    }
  }

  /** Всё, кроме самой камеры: тряска, слушатель, желейки, эффекты, звуки ловушек, отсчёт, интерфейс. */
  private decor(now: number, dt: number): void {
    const cam = this.world.camera;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const k = this.shake * 0.45;
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
      cam.position.z += (Math.random() - 0.5) * k;
    }
    cam.getWorldDirection(this.cameraDir);
    this.d.sound.setListener(cam.position.x, cam.position.y, cam.position.z, this.cameraDir.x, this.cameraDir.y, this.cameraDir.z);
    this.avatarsUpdate(now, dt);
    this.fx.update(dt);
    this.trapSounds();
    this.countdown(now);
    this.hud.tick(now);
    if (now - this.hudAt > 100) {
      this.hudAt = now;
      this.updateHud(now);
    }
  }

  private avatarsUpdate(now: number, dt: number): void {
    const s = this.predictor.state;
    const pos = this.cameraPos;
    tickAvatarShared(now / 1000, this.d.renderer.canvas.clientHeight || window.innerHeight);
    for (const p of this.peers) {
      const a = this.avatars.get(p.id), pose = this.poses.get(p.id);
      if (!a || !pose) continue;
      const local = p.id === this.myId;
      let grounded = s.grounded;
      if (local) {
        pose.x = pos.x;
        pose.y = pos.y;
        pose.z = pos.z;
        pose.yaw = this.d.input.yaw;
      } else {
        const q = this.peerAt(p.id);
        if (!q) continue;
        pose.x = q.x;
        pose.y = q.y;
        pose.z = q.z;
        pose.yaw = q.yaw;
        grounded = q.g;
      }
      pose.flags = E_ALIVE | (grounded ? E_GROUNDED : 0);
      a.setLevel(local ? this.d.ui.me().level : p.level);
      a.update(pose, dt, now / 1000, this.world.collision, this.world.camera.position, local);
      this.tumble(a, p.id, local ? s.fireCd : p.knock, dt, local, pose);
    }
  }

  /** Положения чужих — в историю, по их времени подвижного (vt); телепорт (упал, «к точке») — история заново. */
  private trackPeers(msg: StateMsg): void {
    const ids = new Set<number>();
    for (const q of msg.peers) {
      if (q.id === msg.id) continue;
      ids.add(q.id);
      const t = q.vt ?? msg.tick;
      let tr = this.tracks.get(q.id);
      if (!tr) this.tracks.set(q.id, (tr = { s: [], lag: msg.tick - t }));
      tr.lag += (msg.tick - t - tr.lag) * 0.1;
      const s = tr.s, last = s[s.length - 1];
      const sample: PeerSample = { t, x: q.x, y: q.y, z: q.z, yaw: q.yaw, g: q.grounded };
      if (last && (t < last.t || Math.hypot(q.x - last.x, q.y - last.y, q.z - last.z) > 6)) {
        s.length = 0;
        tr.lag = msg.tick - t;
      }
      const prev = s[s.length - 1];
      if (prev && prev.t === t) Object.assign(prev, sample);
      else s.push(sample);
      if (s.length > 16) s.shift();
    }
    for (const id of this.tracks.keys()) if (!ids.has(id)) this.tracks.delete(id);
  }

  /**
   * Где рисовать чужого: его история в его времени, позади на задержку часов (без угадывания вперёд). Стоит на
   * подвижной площадке или на карусели — едет с ней до времени картинки, а не висит рядом.
   */
  private peerAt(id: number): PeerSample | null {
    const tr = this.tracks.get(id);
    if (!tr || !tr.s.length) return null;
    const s = tr.s, out = this.peerPose;
    const pt = this.clock.renderTick - tr.lag;
    let a = s[0], b = s[0], k = 0;
    if (pt >= s[s.length - 1].t) a = b = s[s.length - 1];
    else if (pt > s[0].t) {
      let i = 0;
      while (i + 1 < s.length && s[i + 1].t <= pt) i++;
      a = s[i];
      b = s[i + 1];
      k = (pt - a.t) / Math.max(1e-6, b.t - a.t);
    }
    out.t = a === b ? a.t : pt;
    out.x = a.x + (b.x - a.x) * k;
    out.y = a.y + (b.y - a.y) * k;
    out.z = a.z + (b.z - a.z) * k;
    let dy = b.yaw - a.yaw;
    dy -= Math.round(dy / TAU) * TAU;
    out.yaw = a.yaw + dy * k;
    out.g = k < 0.5 ? a.g : b.g;
    const map = this.world.map, t1 = this.viewTick, t0 = out.t;
    if (out.g && t1 !== t0) {
      for (const m of map.movers) {
        const p0 = moverAt(m, t0, this.mp0);
        if (Math.abs(out.y - p0.y) > 0.06 || Math.abs(out.x - p0.x) > m.w / 2 + 0.42 || Math.abs(out.z - p0.z) > m.d / 2 + 0.42) continue;
        const p1 = moverAt(m, t1, this.mp1);
        out.x += p1.x - p0.x;
        out.y += p1.y - p0.y;
        out.z += p1.z - p0.z;
        return out;
      }
      const d = map.disc, rx = out.x - d.cx, rz = out.z - d.cz;
      if (Math.abs(out.y - d.top) < 0.06 && rx * rx + rz * rz < d.r * d.r) {
        const an = (TAU * (t1 - t0)) / d.period, c = Math.cos(an), sn = Math.sin(an);
        out.x = d.cx + rx * c - rz * sn;
        out.z = d.cz + rx * sn + rz * c;
        out.yaw -= an;
      }
    }
    return out;
  }

  /** Сбили — сальто вокруг середины тела, «бумс» и звёздочки. knock — сколько тиков ещё кувыркаться. */
  private tumble(a: Avatar, id: number, knock: number, dt: number, local: boolean, pose: AvatarPose): void {
    let st = this.tumbles.get(id);
    if (!st) {
      st = { t: -1, last: 0 };
      this.tumbles.set(id, st);
    }
    if (knock > 0 && (st.last === 0 || knock > st.last + 2)) {
      st.t = Math.max(0, (SKILL_KNOCK_TICKS - knock) / 60);
      a.jolt(1);
      this.fx.hit(pose.x, pose.y + 1, pose.z);
      this.sfx.bums(local ? null : [pose.x, pose.y + 0.8, pose.z]);
      if (local) this.shake = 0.3;
    }
    st.last = knock;
    if (st.t >= 0) {
      st.t += dt;
      if (st.t >= TUMBLE_S) st.t = -1;
    }
    const root = a.root;
    if (st.t < 0) {
      root.rotation.x = 0;
      return;
    }
    const k = st.t / TUMBLE_S;
    root.rotation.x = -(1 - (1 - k) * (1 - k) * (1 - k)) * TAU;
    // вокруг середины: сдвинуть корень так, чтобы середина тела осталась на месте
    this.pivot.set(0, 0.8, 0);
    this.turned.copy(this.pivot).applyEuler(root.rotation);
    root.position.add(this.pivot).sub(this.turned);
  }

  /** Ловушки рядом слышно заранее: свист мешка, шипение тарана перед ударом, ветер перед порывом, лестница. */
  private trapSounds(): void {
    const map = this.world.map, t = this.viewTick, me = this.cameraPos;
    const near = (x: number, y: number, z: number, r: number): boolean => (x - me.x) ** 2 + (y - me.y) ** 2 + (z - me.z) ** 2 < r * r;
    for (let i = 0; i < map.sacks.length; i++) {
      const sp = sackAt(map.sacks[i], t, this.sackPose);
      const was = this.sackWas[i];
      this.sackWas[i] = sp.a;
      if (was !== undefined && (was < 0) !== (sp.a < 0) && near(sp.x, sp.y, sp.z, 13)) this.sfx.swoosh([sp.x, sp.y, sp.z]);
    }
    for (let i = 0; i < map.rams.length; i++) {
      const r = map.rams[i];
      const st = ramState(r.phase, t, this.ramTmp);
      const was = this.ramWas[i];
      this.ramWas[i] = st.phase;
      if (was === undefined || was === st.phase) continue;
      const y = (r.y0 + r.y1) / 2;
      if (st.phase === 'wind' && near(r.fx, y, r.fz, 15)) this.sfx.ramWind([r.fx, y, r.fz]);
      else if (st.phase === 'strike' && near(r.fx, y, r.fz, 20)) this.sfx.ramHit([r.fx + r.dx * r.stroke, y, r.fz + r.dz * r.stroke]);
    }
    const wz = map.winds[0];
    if (wz) {
      const w = windState(wz.phase, t);
      const inside = me.x > wz.x0 - 6 && me.x < wz.x1 + 6 && me.z > wz.z0 - 6 && me.z < wz.z1 + 6 && me.y > wz.y0 - 4 && me.y < wz.y1 + 4;
      const src: V3 = [(wz.x0 + wz.x1) / 2 - wz.dx * 12, (wz.y0 + wz.y1) / 2, (wz.z0 + wz.z1) / 2 - wz.dz * 12];
      if (inside && this.windWas === 0 && w > 0 && w < 1) this.sfx.gustWarn(src);
      if (inside && this.windWas < 1 && w >= 1) this.sfx.gust(src);
      this.windWas = w;
      this.gust = inside ? (w >= 1 ? 1 : w * 0.4) : 0;
    }
    const reform = crumbleReformIn(t) < 30;
    if (reform && !this.reformWas && me.y > 42) this.sfx.stairsBack([0, 56, 0]);
    this.reformWas = reform;
  }

  /** Пыль тарана, растаявшее облако, упавшая ступень. */
  private puff(x: number, y: number, z: number, kind: 'dust' | 'cloud' | 'step'): void {
    const now = performance.now();
    if (now < this.quietUntil) return;
    const me = this.cameraPos;
    const d2 = (x - me.x) ** 2 + (y - me.y) ** 2 + (z - me.z) ** 2;
    if (kind === 'dust') this.fx.dust(x, y, z, 10);
    else if (kind === 'cloud') {
      this.fx.puff(x, y, z, 14, 0xffffff, 2.4, 1);
      if (d2 < 24 * 24) this.sfx.puff([x, y, z]);
    } else {
      this.fx.dust(x, y, z, 5);
      if (d2 < 22 * 22 && now - this.crumbleAt > 140) {
        this.crumbleAt = now;
        this.sfx.crumble([x, y, z]);
      }
    }
  }

  /** Большой отсчёт старта и подсказка сбора. Писк — на каждой цифре и на «МАРШ!». */
  private countdown(now: number): void {
    const left = this.lock - this.viewTick;
    let big = '', sub = '';
    if (this.racer && this.lock > 0 && left > -60) {
      if (left > SKILL_COUNT_TICKS) sub = now - this.waitingAt < 700 ? 'Ждём, пока все загрузятся…' : `Забег! Старт через ${Math.ceil(left / 60)} с`;
      else if (left > 0) {
        big = String(Math.ceil(left / 60));
        sub = 'Приготовься!';
      } else big = 'МАРШ!';
    } else if (!this.racer && this.race.phase === 'pre') {
      sub = `Друзья собирают забег · E — встать на старт (${Math.max(0, Math.ceil((this.race.phaseEnd - this.viewTick) / 60))} с)`;
    }
    if (big !== this.countText) {
      this.countText = big;
      if (big === 'МАРШ!') this.sfx.count(0);
      else if (big) this.sfx.count(Number(big));
    }
    this.hud.countdown(big, sub);
  }

  private updateHud(now: number): void {
    const p = this.progress;
    const cp = Math.min(p.checkpoint, SKILL_SECTIONS.length - 1);
    const sec = SKILL_SECTIONS[cp];
    this.hud.section(cp, SKILL_SECTIONS.length, sec.name, sec.rule);
    this.hud.live(p.finishedAt === null && cp === SKILL_SECTIONS.length - 1 ? this.stairsHint() : '');
    let time = skillTime(0), sub: string, cls = '';
    if (p.startedAt !== null) {
      const el = Math.max(0, (p.finishedAt ?? this.viewTick) - p.startedAt);
      time = skillTime(el);
      if (p.finishedAt !== null) {
        const m = skillMedal(el);
        sub = `${SKILL_MEDALS[m]} · колокол!`;
        cls = MEDAL_CLASS[m];
      } else if (el <= SKILL_GOLD_TICKS) {
        sub = `до золота ${skillClock(SKILL_GOLD_TICKS - el)}`;
        cls = 'gold';
      } else if (el <= SKILL_SILVER_TICKS) {
        sub = `до серебра ${skillClock(SKILL_SILVER_TICKS - el)}`;
        cls = 'silver';
      } else {
        sub = 'бронза — главное, дойди';
        cls = 'bronze';
      }
    } else sub = this.racer && this.race.phase === 'pre' ? 'старт — по отсчёту' : 'время пойдёт, как сойдёшь с крыши';
    const best = (this.best > 0 ? `рекорд ${skillTime(Math.round(this.best * 0.06))}` : 'рекорда пока нет') + (p.falls > 0 ? ` · падений ${p.falls}` : '');
    this.hud.clock(time, sub, cls, best);
    const top = this.world.map.bell.y0;
    const myY = this.predictor.state.y;
    const marks: MeterMark[] = this.peers.map((q) => {
      const me = q.id === this.myId;
      return { id: q.id, nick: q.nick, me, done: q.finished, racer: q.racer, h: q.finished ? 1 : (me ? myY : q.y) / top };
    });
    let place = '';
    if (this.race.phase === 'run' && !this.racer) place = 'свой подъём';
    else if (this.racer && this.race.phase === 'run' && this.race.racers > 1) {
      const order = this.peers.filter((q) => q.racer).sort(byPlace);
      const i = order.findIndex((q) => q.id === this.myId);
      if (i >= 0) place = `${i + 1} место из ${order.length}`;
    }
    this.hud.meterUpdate(marks, p.finishedAt !== null ? 1 : myY / top, place);
    if (this.race.phase === 'done' && this.race.rows.length > 0) {
      this.hud.table(this.race.rows, this.d.ui.me().pid, Math.max(0, Math.ceil((this.race.phaseEnd - this.viewTick) / 60)));
    } else this.hud.hideTable();
    if (this.cardUntil && now > this.cardUntil) {
      this.cardUntil = 0;
      this.hud.hideFinish();
    }
    const ph = this.race.phase, idle = p.startedAt === null || p.finishedAt !== null;
    this.hud.canAgain((ph === 'pre' && !this.racer) || ((ph === 'none' || ph === 'done') && idle));
    this.sfx.bedUpdate(clamp(myY / top, 0, 1), this.gust);
  }

  /** Лестница колокольни: когда побежит обвал и когда она соберётся. */
  private stairsHint(): string {
    const t = this.viewTick;
    const front = crumbleFront(t);
    if (front < 0) return `Лестница целая — беги! Обвал через ${Math.ceil(-front / CRUMBLE_SPEED)} с`;
    if (front < this.world.map.stairLength) return 'Обвал бежит снизу вверх — не стой на ступенях!';
    return `Лестница соберётся через ${Math.ceil(crumbleReformIn(t) / 60)} с`;
  }

  private use(id: 0 | 1): void {
    this.d.net.send({ t: 'use', id });
  }

  /** «Ещё забег» (E): после итогов или без забега; в пути — только вторым нажатием, чтобы не сбросить подъём. */
  private again(): void {
    const ph = this.race.phase, p = this.progress;
    if (ph === 'run') {
      this.hud.notice('Забег идёт — «Ещё забег» после итогов. N — начать заново одному');
      return;
    }
    if (ph === 'pre' && this.racer) return;
    const busy = p.startedAt !== null && p.finishedAt === null;
    const now = performance.now();
    if (busy && now - this.confirmAt > 3000) {
      this.confirmAt = now;
      this.hud.notice('Ты в пути: нажми E ещё раз — и на старт нового забега');
      return;
    }
    this.confirmAt = 0;
    this.d.net.send({ t: 'use', id: 2 });
  }

  onKey(code: string, down: boolean, e: KeyboardEvent): boolean {
    if (!down || e.repeat || this.d.input.blocked) return false;
    if (code === 'KeyR' || code === 'KeyN') {
      this.use(code === 'KeyR' ? 1 : 0);
      return true;
    }
    return false;
  }

  onUse(mouse: boolean): void {
    if (!mouse) this.again();
  }

  resize(w: number, h: number): void {
    this.world.resize(w, h);
  }

  /** Только для снимков из консоли: поставить камеру (или null — вернуть за спину). */
  debugView(v: [number, number, number, number, number, number] | null): void {
    this.photo = v;
  }

  debugState(): Record<string, unknown> {
    const s = this.predictor.state;
    return {
      mode: 'skill', course: SKILL_COURSE, ready: this.ready, tick: this.tick, viewTick: this.viewTick, id: this.myId,
      player: { x: s.x, y: s.y, z: s.z, grounded: s.grounded, knock: s.fireCd }, progress: { ...this.progress },
      race: { id: this.race.id, phase: this.race.phase, phaseEnd: this.race.phaseEnd, start: this.race.start, racers: this.race.racers, rows: this.race.rows.length },
      racer: this.racer, lock: this.lock, count: this.countText, best: this.best, peers: this.peers.length, corrections: this.predictor.corrections,
      boxes: this.world.map.boxes.length, zoom: this.world.camera.fov,
    };
  }
}

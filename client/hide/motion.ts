// Движение в прятках на клиенте: своё — предсказанием (та же физика, что у сервера: shared/hidephysics.ts),
// чужое — интерполяцией по общим часам отрисовки. Предметы приходят дельтой (HideStateMsg): кто не менялся —
// не приходит; поэтому перед первым изменением «стоявшего» предмета дописываем его прежнюю позу на тик прошлого
// снимка — иначе он бы «поехал» заранее.
import { HIDE_KINDS, hideYaw, type HideKind } from '../../shared/hideprops.ts';
import { HidePhysics, hideMotionWorld, type HideBody } from '../../shared/hidephysics.ts';
import type { HideStateMsg } from '../../shared/hide.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import type { Input } from '../../shared/sim.ts';
import { ClockSync } from '../net.ts';
import { Predictor } from '../predict.ts';
import { RemoteTrack, type RemoteSample } from '../remote.ts';
import type { PropView } from './props.ts';

export interface Body extends HideBody { stains: number }
export interface HunterView { id: number; x: number; y: number; z: number; yaw: number; pitch: number }

const sample = (): RemoteSample => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED, extra: 0 });
const snap = (x: number, y: number, z: number, yaw: number, pitch = 0) => ({ id: 0, x, y, z, yaw, pitch, flags: E_ALIVE | E_GROUNDED, hp: 0, armor: 0 });

interface Track { track: RemoteTrack; pose: RemoteSample; lastX: number; lastZ: number; view: PropView }

export class HideMotion {
  readonly world = hideMotionWorld();
  readonly physics = new HidePhysics(this.world);
  predictor = new Predictor(this.world, this.physics);
  readonly clock = new ClockSync(8);
  /** Свой игрок в кадре (с поправкой после расхождения) */
  readonly position = { x: 0, y: 0, z: 0 };
  /** Последнее известное о предметах: для своей физики, прицела и превращений */
  readonly bodies = new Map<number, Body>();
  /** Предметы в кадре (интерполированные; свой — по предсказанию) */
  readonly shown: PropView[] = [];
  readonly hunters: HunterView[] = [];
  private readonly list: Body[] = [];
  private readonly tracks = new Map<number, Track>();
  private readonly hunterTracks = new Map<number, { track: RemoteTrack; pose: RemoteSample }>();
  private epoch = '';
  private reset = -1;
  private lastTick = 0;
  ownId = 0;

  /** Тик, который сейчас на экране у чужих (для отката выстрела) */
  get renderTick(): number { return this.clock.renderTick; }
  /** Тик ввода: самый свежий, который мог бы уже прийти */
  tick(now: number): number { return Math.min(this.clock.lastTick + 12, this.clock.estimate(now)); }

  accept(m: HideStateMsg, at: number): void {
    const epoch = `${m.match}:${m.round}`;
    const fresh = epoch !== this.epoch;
    if (fresh) {
      // сервер начал раунд с пустой очередью входов: прошлые входы не переигрываем
      this.predictor = new Predictor(this.world, this.physics);
      this.epoch = epoch;
      this.hunterTracks.clear();
    }
    this.clock.addSample(m.tick, at);
    if (m.full) { this.bodies.clear(); this.tracks.clear(); }
    for (let i = 0; i + 6 < m.p.length; i += 7) {
      const id = m.p[i], kind: HideKind = HIDE_KINDS[m.p[i + 1]] ?? 'crate';
      const x = m.p[i + 2] / 100, y = m.p[i + 3] / 100, z = m.p[i + 4] / 100, yaw = m.p[i + 5], stains = m.p[i + 6];
      const old = this.bodies.get(id);
      let t = this.tracks.get(id);
      if (!t) { t = { track: new RemoteTrack(id), pose: sample(), lastX: x, lastZ: z, view: { id, kind, x, y, z, yaw: hideYaw(yaw), stains, speed: 0 } }; this.tracks.set(id, t); }
      if (old && (old.kind !== kind || Math.hypot(old.x - x, old.z - z) > 4)) t.track.clear();
      else if (old && t.track.lastTick < this.lastTick) t.track.push(this.lastTick, snap(old.x, old.y, old.z, hideYaw(old.yaw)));
      t.track.push(m.tick, snap(x, y, z, hideYaw(yaw)));
      t.view.kind = kind; t.view.stains = stains;
      this.bodies.set(id, { id, kind, x, y, z, yaw, stains });
    }
    for (const id of m.gone) { this.bodies.delete(id); this.tracks.delete(id); }
    this.lastTick = m.tick;
    this.list.length = 0;
    for (const b of this.bodies.values()) this.list.push(b);

    const s = m.self, playing = m.phase === 'hide' || m.phase === 'seek';
    const ph = this.physics;
    ph.mover = playing && s.role === 'prop' ? 'prop' : playing && s.role === 'hunter' && m.phase === 'seek' ? 'hunter' : 'still';
    ph.kind = s.kind; ph.yaw = s.yaw; ph.locked = s.locked;
    ph.ownId = s.role === 'prop' ? s.prop : 0;
    ph.props = this.list;
    this.ownId = ph.ownId;
    if (fresh || s.reset !== this.reset) this.predictor.reset(s.state, s.ack);
    else this.predictor.reconcile(s.ack, s.state);
    this.reset = s.reset;

    const seen = new Set<number>();
    for (let i = 0; i + 5 < m.h.length; i += 6) {
      const id = m.h[i];
      seen.add(id);
      let h = this.hunterTracks.get(id);
      if (!h) { h = { track: new RemoteTrack(id), pose: sample() }; this.hunterTracks.set(id, h); }
      const x = m.h[i + 1] / 100, y = m.h[i + 2] / 100, z = m.h[i + 3] / 100;
      if (Math.hypot(x - h.track.lastX, z - h.track.lastZ) > 4) h.track.clear();
      h.track.push(m.tick, snap(x, y, z, m.h[i + 4] / 1000, m.h[i + 5] / 1000));
    }
    for (const id of [...this.hunterTracks.keys()]) if (!seen.has(id)) this.hunterTracks.delete(id);
  }

  step(input: Input): void { this.predictor.step(input, false); }

  /** Кадр: своё — между двумя шагами физики (alpha), чужое — на часах отрисовки. */
  render(now: number, dt: number, alpha: number): void {
    this.clock.update(now, dt * 1000);
    this.predictor.decay(dt);
    const { prev, state, offset } = this.predictor;
    const a = Math.max(0, Math.min(1, alpha));
    this.position.x = prev.x + (state.x - prev.x) * a + offset.x;
    this.position.y = prev.y + (state.y - prev.y) * a + offset.y;
    this.position.z = prev.z + (state.z - prev.z) * a + offset.z;
    const t = this.clock.renderTick;
    this.shown.length = 0;
    for (const [id, tr] of this.tracks) {
      const v = tr.view, b = this.bodies.get(id)!;
      if (id === this.ownId) {
        v.x = this.position.x; v.y = this.position.y; v.z = this.position.z; v.yaw = hideYaw(this.physics.yaw); v.kind = this.physics.kind;
      } else {
        tr.track.sample(t, tr.pose);
        v.x = tr.pose.x; v.y = tr.pose.y; v.z = tr.pose.z; v.yaw = tr.pose.yaw;
      }
      const moved = Math.hypot(v.x - tr.lastX, v.z - tr.lastZ);
      v.speed = dt > 0 ? v.speed + (moved / dt - v.speed) * Math.min(1, dt * 12) : 0;
      if (v.speed < 0.05) v.speed = 0;
      tr.lastX = v.x; tr.lastZ = v.z;
      v.stains = b?.stains ?? 0;
      this.shown.push(v);
    }
    this.hunters.length = 0;
    for (const [id, h] of this.hunterTracks) {
      if (!h.track.sample(t, h.pose)) continue;
      this.hunters.push({ id, x: h.pose.x, y: h.pose.y, z: h.pose.z, yaw: h.pose.yaw, pitch: h.pose.pitch });
    }
  }

  /** Сменилась роль/раунд (выход, новый раунд): всё забыть. */
  clear(): void {
    this.bodies.clear(); this.tracks.clear(); this.hunterTracks.clear();
    this.shown.length = 0; this.hunters.length = 0; this.list.length = 0;
    this.epoch = ''; this.reset = -1; this.ownId = 0;
    this.predictor = new Predictor(this.world, this.physics);
  }
}

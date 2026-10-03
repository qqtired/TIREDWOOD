import { HidePhysics } from '../../shared/hidephysics.ts';
import type { HideProp, HideServerMsg } from '../../shared/hide.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import type { Input } from '../../shared/sim.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import { ClockSync } from '../net.ts';
import { Predictor } from '../predict.ts';
import { RemoteTrack, type RemoteSample } from '../remote.ts';

const pose = (): RemoteSample => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED, extra: 0 });
interface PropTrack { track: RemoteTrack; pose: RemoteSample; prop: HideProp }

/** Lobby primitives: one 10 Hz snapshot interval plus two ticks of arrival jitter. */
export class HideMotion {
  predictor: Predictor;
  readonly physics: HidePhysics;
  readonly position = { x: 0, y: 0, z: 0 };
  readonly props: HideProp[] = [];
  readonly hunter = pose();
  hasHunter = false;
  private readonly world: CollisionWorld;
  private readonly clock = new ClockSync(8);
  private readonly tracks = new Map<number, PropTrack>();
  private readonly hunterTrack = new RemoteTrack(65000);
  private round = -1;
  private reset = -1;

  constructor(world: CollisionWorld) {
    this.world = world; this.physics = new HidePhysics(world); this.predictor = new Predictor(world, this.physics);
  }
  accept(message: HideServerMsg, at: number): void {
    const m = message;
    const newRound = m.round !== this.round;
    if (newRound) {
      // The authority resets its InputQueue at round start. Never replay the preceding round's inputs.
      this.predictor = new Predictor(this.world, this.physics);
      this.tracks.clear(); this.hunterTrack.clear(); this.round = m.round;
    }
    this.clock.addSample(m.tick, at);
    this.physics.form = m.self.form; this.physics.yaw = m.self.propYaw; this.physics.locked = m.self.locked;
    this.physics.free = !m.self.found && ((m.self.role === 'prop' && (m.phase === 'hide' || m.phase === 'seek')) || (m.self.role === 'hunter' && m.phase === 'seek'));
    this.physics.propId = m.self.role === 'prop' ? m.self.propId : 0;
    this.physics.props = m.props;
    if (newRound || this.reset !== m.self.reset) this.predictor.reset(m.self.state, m.self.ack);
    else this.predictor.reconcile(m.self.ack, m.self.state);
    this.reset = m.self.reset;
    const seen = new Set<number>();
    for (const prop of m.props) {
      seen.add(prop.id);
      let entry = this.tracks.get(prop.id);
      if (!entry) { entry = { track: new RemoteTrack(prop.id), pose: pose(), prop: { ...prop } }; this.tracks.set(prop.id, entry); }
      if (entry.prop.form !== prop.form || Math.hypot(prop.x - entry.track.lastX, prop.z - entry.track.lastZ) > 4) entry.track.clear();
      entry.prop.form = prop.form;
      entry.track.push(m.tick, { ...prop, pitch: 0, flags: E_ALIVE | E_GROUNDED, hp: 0, armor: 0 });
    }
    for (const id of this.tracks.keys()) if (!seen.has(id)) this.tracks.delete(id);
    this.hasHunter = m.hunter !== null;
    if (m.hunter) {
      if (Math.hypot(m.hunter.x - this.hunterTrack.lastX, m.hunter.z - this.hunterTrack.lastZ) > 4) this.hunterTrack.clear();
      this.hunterTrack.push(m.tick, { ...m.hunter, id: 65000, pitch: 0, flags: E_ALIVE | E_GROUNDED, hp: 0, armor: 0 });
    } else this.hunterTrack.clear();
  }
  step(input: Input): void { this.predictor.step(input, false); }
  tick(now: number): number { return Math.min(this.clock.lastTick + 12, this.clock.estimate(now)); }
  render(now: number, dt: number, alpha: number): void {
    this.clock.update(now, dt * 1000);
    this.predictor.decay(dt);
    const { prev, state, offset } = this.predictor;
    const a = Math.max(0, Math.min(1, alpha));
    this.position.x = prev.x + (state.x - prev.x) * a + offset.x;
    this.position.y = prev.y + (state.y - prev.y) * a + offset.y;
    this.position.z = prev.z + (state.z - prev.z) * a + offset.z;
    this.props.length = 0;
    for (const entry of this.tracks.values()) {
      entry.track.sample(this.clock.renderTick, entry.pose);
      const { x, y, z, yaw } = entry.pose;
      entry.prop.x = x; entry.prop.y = y; entry.prop.z = z; entry.prop.yaw = yaw; this.props.push(entry.prop);
    }
    if (this.hasHunter) this.hunterTrack.sample(this.clock.renderTick, this.hunter);
  }
}

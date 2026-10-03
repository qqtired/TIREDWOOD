// Independent acceptance witness: from the real initial spawn to the real finish.
// Feature state and position are never assigned. Every simulation step receives a
// normal wire-encoded input (forward/yaw/jump or idle), through the public server API.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SkillGame, type SkillPlayer } from '../server/skilltest/game.ts';
import { moverPeriod, moverU } from '../shared/aquadyn.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { decodeInputs, encodeInputs } from '../shared/protocol.ts';
import { BTN_FORWARD, BTN_JUMP, makeInput, type Input } from '../shared/sim.ts';
import { SKILL_CHECKPOINTS } from '../shared/skilltest.ts';

type Stop = [number, number?, number?];

class KeyboardPilot {
  readonly game = new SkillGame(() => 0);
  readonly player: SkillPlayer;
  readonly checkpoints: number[] = [];
  readonly landings: Array<{ x: number; y: number; z: number; tick: number }> = [];
  private seq = 0;
  private allowedFalls = 0;
  hits = 0;
  jumps = 0;
  maxY = 40;
  longestWait = 0;

  constructor() {
    this.player = this.game.addHuman({ pid: 91, nick: 'Keyboard witness', outfit: DEFAULT_OUTFIT }, { sendJson() {} })!;
    assert.ok(this.player);
  }

  step(buttons = 0, yaw = -Math.PI / 2): void {
    assert.equal(buttons & ~(BTN_FORWARD | BTN_JUMP), 0, 'no dash, developer actions or special movement');
    const p = this.player, prevCp = p.progress.checkpoint, prevCd = p.state.dashCd;
    const input = { ...makeInput(), seq: ++this.seq, viewTick: this.game.tick + 1, buttons, yaw };
    const decoded: Input[] = [];
    assert.equal(decodeInputs(encodeInputs([input], 0, 1, 0), decoded), 1);
    this.game.onInputs(p, decoded, 1);
    this.game.step();
    assert.ok(p.progress.falls <= this.allowedFalls, `unexpected fall at tick ${this.game.tick}, checkpoint ${p.progress.checkpoint}`);
    assert.ok(p.progress.checkpoint >= prevCp && p.progress.checkpoint <= prevCp + 1, 'only consecutive checkpoint progression');
    if (p.progress.checkpoint > prevCp) this.checkpoints.push(p.progress.checkpoint);
    if (p.state.dashCd > prevCd && p.state.dashCd > 78) this.hits++;
    if (buttons & BTN_JUMP) this.jumps++;
    this.maxY = Math.max(this.maxY, p.state.y);
    assert.ok(Number.isFinite(p.state.x + p.state.y + p.state.z));
  }

  idle(ticks: number): void { for (let n = 0; n < ticks; n++) this.step(); }

  wait(until: () => boolean): void {
    for (let n = 0; n <= 900; n++) {
      if (until()) { this.longestWait = Math.max(this.longestWait, n); return; }
      this.step();
    }
    assert.fail(`timed obstacle did not present an opportunity within 15 s, tick ${this.game.tick}`);
  }

  /** Ground support is inspected, but never altered: jump shortly before an edge. */
  go(x: number, z = 0, y = 40, clearHazards = false): void {
    for (let n = 0; n < 600; n++) {
      const s = this.player.state, dx = x - s.x, dz = z - s.z, dist = Math.hypot(dx, dz);
      if (dist < 0.45 && s.grounded && Math.abs(s.y - y) < 0.15) {
        this.landings.push({ x, y: s.y, z, tick: this.game.tick });
        return;
      }
      let buttons = dist > 0.2 ? BTN_FORWARD : 0;
      let jump = s.grounded && dist > 2 && this.game.world.groundBelow(s.x + dx / dist, s.y + 0.1, s.z + dz / dist) < s.y - 0.5;
      if (clearHazards && s.grounded && x - s.x > 1 && this.game.map.hazards.some(h => Math.abs(h.z - s.z) < 3 && h.x > s.x && h.x - s.x < 3.05)) jump = true;
      if (jump && !(s.prevButtons & BTN_JUMP)) buttons |= BTN_JUMP;
      this.step(buttons, Math.atan2(-dx, -dz));
    }
    const s = this.player.state;
    assert.fail(`landing ${x},${y},${z} not reached in 10 s; ended ${s.x},${s.y},${s.z}`);
  }

  /** Board at the beginning of its 75-tick rest, with a complete jump's margin. */
  board(moverIndex: number): void {
    const m = this.game.map.movers[moverIndex], period = moverPeriod(m);
    this.wait(() => ((this.game.tick - m.phase) % period + period) % period < 10);
    this.go((m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2, m.top);
    const before = { x: this.player.state.x, y: this.player.state.y };
    this.wait(() => moverU(m, this.game.tick) > 0.995);
    assert.ok(Math.abs((this.player.state.x - before.x) - m.dx) < 0.65, 'horizontal motion came from platform carry');
    assert.ok(Math.abs((this.player.state.y - before.y) - m.dy) < 0.05, 'vertical motion came from platform carry');
    assert.equal(this.player.state.grounded, 1);
  }

  /** Real fall: walk sideways off a safe deck, let gravity and server fallback act. */
  fallAndResume(cp: number): void {
    const p = this.player, oldFalls = p.progress.falls, oldStart = p.progress.startedAt, oldReset = p.reset;
    assert.equal(p.progress.checkpoint, cp);
    this.allowedFalls++;
    for (let n = 0; n < 300 && p.progress.falls === oldFalls; n++) this.step(BTN_FORWARD, 0);
    assert.equal(p.progress.falls, oldFalls + 1);
    assert.equal(p.progress.checkpoint, cp);
    assert.equal(p.progress.startedAt, oldStart, 'fall never resets the run timer');
    assert.equal(p.reset, oldReset + 1);
    assert.deepEqual([p.state.x, p.state.y, p.state.z], [SKILL_CHECKPOINTS[cp].x, 40, 0]);
    assert.equal(p.input.length, 0, 'stale motion cannot replay from checkpoint');
    const cd = p.state.dashCd;
    this.idle(60);
    assert.equal(p.progress.falls, oldFalls + 1, 'checkpoint is safe to wait on');
    assert.equal(p.state.grounded, 1);
    assert.equal(p.state.dashCd, cd, 'no hidden hazard reaches the checkpoint');
  }

  route(initialIdle: number, exerciseFallback = false): void {
    const checkpoint = (cp: number) => {
      assert.equal(this.player.progress.checkpoint, cp);
      if (exerciseFallback) this.fallAndResume(cp);
    };
    this.idle(initialIdle);
    for (const x of [9, 18, 25, 30]) this.go(x);
    checkpoint(1);
    this.board(0); this.go(60); checkpoint(2);
    this.go(90, 0, 40, true); checkpoint(3);
    const precision: Stop[] = [[96, 1.8], [101.2, -1.8], [106.4, 1.8], [111.6, -1.8], [116.8, 1.8], [120]];
    for (const [x, z] of precision) this.go(x, z);
    checkpoint(4);
    // Exhibits one fair opening in the two rotating bars' shared 240-tick cycle.
    this.wait(() => this.game.tick % 240 === 173);
    for (const [x, z] of [[130.5, 2], [141, 2], [146, 0], [150, 0]]) this.go(x, z, 40, true);
    checkpoint(5);
    this.board(1);
    this.go(162, 0, 44); this.go(169, -1, 42.7); this.go(175, 1, 41.3); this.go(180);
    checkpoint(6);
    this.wait(() => this.game.tick % 310 < 15);
    for (const x of [186, 191.1, 196.2, 201.3, 206.4, 210]) this.go(x);
    checkpoint(7);
    this.board(7); this.go(230); this.go(235, 1); this.go(240);
    assert.deepEqual(this.checkpoints, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.notEqual(this.player.progress.finishedAt, null);
    assert.equal(this.player.progress.falls, exerciseFallback ? 7 : 0);
    assert.equal(this.hits, 0, 'this route clears all timed hazards without relying on knockback');
    assert.equal(this.player.reset, exerciseFallback ? 8 : 1, 'no unreported relocation after the initial spawn');
    assert.ok(this.jumps >= 15 && this.jumps < 60);
    assert.ok(this.maxY > 44 && this.maxY < 45.7, 'ordinary jump ceiling above elevator exit');
    assert.ok(this.longestWait <= 450, 'every opportunity arrived in one mover cycle');
  }
}

test('full sky course is traversable from initial spawn with wire inputs and no dash, hits, falls or teleports', (t) => {
  for (const initialIdle of [0, 17, 73, 151, 209, 401, 733, 1301]) {
    const pilot = new KeyboardPilot();
    pilot.route(initialIdle);
    assert.ok(pilot.player.progress.finishedAt! - pilot.player.progress.startedAt! < 90 * 60);
    assert.equal(pilot.landings.length, 32);
    t.diagnostic(`initialIdle=${initialIdle}; runTicks=${pilot.player.progress.finishedAt! - pilot.player.progress.startedAt!}; jumps=${pilot.jumps}; longestWait=${pilot.longestWait}; maxY=${pilot.maxY.toFixed(3)}; falls=0; hits=${pilot.hits}`);
  }
});

test('physical falls at all seven intermediate checkpoints restore safely and the same input-only route still finishes', (t) => {
  const pilot = new KeyboardPilot();
  pilot.route(0, true);
  assert.ok(pilot.player.progress.finishedAt! > pilot.player.progress.startedAt!);
  t.diagnostic(`fallback runTicks=${pilot.player.progress.finishedAt! - pilot.player.progress.startedAt!}; falls=${pilot.player.progress.falls}; hits=${pilot.hits}; resets=${pilot.player.reset}`);
});

test('the continuous wire-input route deterministically repeats and finish time remains frozen', () => {
  const a = new KeyboardPilot(), b = new KeyboardPilot();
  a.route(0); b.route(0);
  assert.deepEqual(a.landings, b.landings);
  assert.deepEqual(a.player.state, b.player.state);
  assert.deepEqual(a.player.progress, b.player.progress);
  const finish = a.player.progress.finishedAt;
  a.idle(180);
  assert.equal(a.player.progress.finishedAt, finish);
  assert.equal(a.player.progress.falls, 0);
});

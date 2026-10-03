# Independent review: full Sky Skill course is physically completable

**Verified:** the actual server physics completes all eight sections continuously from the normal initial spawn to the normal finish. A deterministic witness uses only forward movement, camera yaw, ordinary jumps and bounded idle waits. It needs no dash, hazard knockback, checkpoint shortcut or position assignment. Eight different initial start phases all completed with **zero falls and zero hazard hits**.

No feature-source changes were needed. This review added only `test/skill-route.test.ts` and this report. Browser rendering, human usability and desktop FPS remain a separate acceptance task.

## Exact evidence boundary

The witness creates a real `SkillGame`, joins through `addHuman`, then submits every movement step through:

```text
makeInput → encodeInputs → decodeInputs → SkillGame.onInputs → SkillGame.step
```

Consequently the route includes the existing float32 wire representation of yaw, normal input queue handling, advisory-clock clamping, shared collision physics, moving-platform carry, hazard checks, gravity, authoritative checkpoint progress and authoritative finish timing.

The test never writes a player position, velocity, grounded flag, checkpoint, timer, game tick or collision box. There is no section-only teleport setup in the full-route tests. Every trajectory begins at the actual starting checkpoint. The no-fall runs assert exactly one reset: the initial spawn.

The pilot reads the collision world for a one-metre look ahead before a gap. This is a constructive traversability witness, not a claim that an inexperienced person will reproduce the timing without learning the course.

## Continuous route

| Section | Inputs / landing targets | Proven physical boundary |
|---|---|---|
| 1. Первые облака | Ordinary jumps toward X=9,18,25,30, Z=0 | Entire warm-up from initial spawn to checkpoint 1 |
| 2. Небесный паром | Board X=36 during the first 10 ticks of its 450-tick cycle; idle on it until far end; jump to X=60 | Actual horizontal carry across the void and a real exit landing |
| 3. Пульс ветра | Continue to X=90; jump when a pulse is within approximately 3 m ahead | All three pulse zones crossed without damage |
| 4. Точная линия | X/Z: 96/1.8, 101.2/−1.8, 106.4/1.8, 111.6/−1.8, 116.8/1.8, 120/0 | Five narrow alternating landings, ordinary jump range and checkpoint 4 |
| 5. Две орбиты | Wait safely at checkpoint until tick mod 240 = 173; target 130.5/2, 141/2, 146/0, 150/0 | Both rotating bars and intervening gaps, without using knockback |
| 6. Лифт в небо | Board X=156 at the beginning of the rest cycle; ride to Y=44; land at 162/0/44, 169/−1/42.7, 175/1/41.3, 180/0/40 | Real vertical carry, upper exit jump and all descending steps |
| 7. Тающие облака | At checkpoint 6 wait until tick mod 310 <15; land at X=186,191.1,196.2,201.3,206.4,210 | All five disappearing platforms traversed in sequence, with their genuine dynamic heights |
| 8. Последний полёт | Board final ferry at X=216 early in its cycle; ride to far end; land at 230/0,235/1,240/0 | Final ferry, pulse, precision island and authoritative finish |

All waits and movement legs have hard limits. Observed longest wait was **392 ticks / 6.53 s**, less than one full ferry cycle. No route relies on indefinite waiting. All zero-fall runs used **31 ordinary jumps**; highest observed foot position was **Y=45.613**, consistent with the upper elevator deck plus ordinary jump height.

## Start phase results

Initial delays are ordinary idle inputs on the initial safe deck, not direct edits of the game clock.

| Initial idle ticks | Authoritative run ticks | Run seconds | Falls | Hazard hits |
|---:|---:|---:|---:|---:|
| 0 | 3502 | 58.37 | 0 | 0 |
| 17 | 3485 | 58.08 | 0 | 0 |
| 73 | 3429 | 57.15 | 0 | 0 |
| 151 | 3351 | 55.85 | 0 | 0 |
| 209 | 3293 | 54.88 | 0 | 0 |
| 401 | 3101 | 51.68 | 0 | 0 |
| 733 | 3669 | 61.15 | 0 | 0 |
| 1301 | 3101 | 51.68 | 0 | 0 |

Different waiting times are expected: a later start can meet a ferry earlier in its cycle. The original server run timer begins when the player leaves the starting deck, and remains authoritative.

## Fall and checkpoint recovery

A separate continuous run intentionally walks sideways off **each of the seven intermediate safe checkpoint decks** using movement input. Real gravity triggers the server fallback; no test invokes `respawn` directly.

For every fall the test verifies:

- Exactly one fall and one server reset are recorded.
- The previously earned checkpoint remains selected.
- The original run timer is preserved.
- Position returns to that checkpoint through the server's fallback.
- Already queued motion is consumed, so it cannot replay from the new spawn.
- Sixty subsequent idle ticks stay grounded and do not trigger a second fall or a hazard hit.
- The input-only route continues from there and ultimately reaches the finish.

Observed recovery run: **4402 timer ticks / 73.37 s, seven intended falls, zero hazard hits, eight resets including initial spawn**.

Another test repeats the whole wire-input route twice and compares every recorded landing, final state and progress exactly. Waiting 180 ticks at the finish leaves the recorded finish time unchanged.

## Commands and fresh results

```sh
/opt/homebrew/bin/node --test test/skill-route.test.ts test/skilltest.test.ts
# 18 passed, 0 failed: 3 new independent acceptance tests + 15 existing tests

/opt/homebrew/bin/node --test test/skill-route.test.ts
# 3 passed, 0 failed; prints the phase and recovery metrics above
```

The existing tests supplement the new continuous proof with direct skipped-checkpoint rejection, airborne/under-deck rejection, capacity/duplicate-profile limits, input-spam and advisory-clock constraints, rejoin behavior, deterministic isolated carry, pulse telegraphs and dash-immunity rules. Their white-box setup is not used as evidence of full-route traversal; the independent test provides that boundary.

## Findings and remaining acceptance

No unreachable section, blocked elevator exit, insufficient jump range, unsafe checkpoint or unavoidable softlock was found in the tested route. During probe development, departing for a ferry late in its 75-tick near-end rest could miss the boat; beginning the boarding jump early in the visible rest cycle reliably resolves it. Paired sweepers also require a deliberate opening rather than unconditional forward motion. Those observations are normal timing mechanics, not feature defects.

Not claimed: every possible strategy or phase succeeds without waiting; every mistake is recoverable without a fall; human difficulty is balanced; visual telegraphs are sufficiently legible; browser prediction under network jitter is accepted; mobile or desktop FPS is measured. No server/browser/full repository suite, deployment, Git or production operations were run for this review.

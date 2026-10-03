# Lobby events — integration contract and verification

Status: owned implementation and scoped verification complete; source frozen for root integration/full gate and browser acceptance. This report distinguishes automated proof from remaining visual/runtime acceptance.

## Server integration recipe (room/hub/main owner)

```ts
import { LobbyEvents, eventFlag, type EventPlayer, type EventStats } from './events.ts';
import { Storm } from './storm.ts';
import { Pirates } from './pirates.ts';
import { stormInput, stormPush } from '../../shared/stormdyn.ts';
import { pirateInput, piratePush } from '../../shared/pirates.ts';
import { pirateTailSize, writePirateTail } from '../../shared/piratenet.ts';

// One authoritative list over current real lobby humans. pid is durable profile id.
// eligible: false for any held mini-game, fishing, wardrobe/menu, riding, other room, ephemeral.
const host = {
  players: (): EventPlayer[] => /* current {pid,slot,nick,state,eligible} rows */ [],
  award: (pid: number, tokens: number, stats: EventStats) => {
    // Resolve profile by pid; profiles.credit(profile,tokens), add each supplied stat delta,
    // markDirty; sync tokens/me to the CURRENT client with this profile (never reused slot).
  },
  chat: (text: string) => /* system chat */ undefined,
};
const storm = stormEnabled ? new Storm({ ...host, broadcast: v => broadcast({t:'storm',v}) }) : null;
const pirates = piratesEnabled ? new Pirates({ ...host, broadcast: v => broadcast({t:'pirates',v}) }, map, world) : null;
const events = new LobbyEvents({storm,pirates,now:Date.now,humans:()=>realLobbyHumans,
  rain:()=>weather.rain, meta:store.state.lobbyEvents,
  save:meta=>{store.state.lobbyEvents=meta;store.markDirty();store.flush();},
  devStorm:dev && env.DEV_STORM==='now', devPirates:dev && env.DEV_PIRATES==='now'});
```

`eventFlag(env.STORM,dev)` and `eventFlag(env.PIRATES,dev)`: default DEV-only, explicit 0 disables. Only construct controllers when enabled. `events.step(room.tick)` once per room tick before player inputs; its calls step both controllers and then scheduling. Keep Hub active/stepping this room while `events.active`, including development countdown and empty-lobby active event. Greetings include each enabled controller's `.view()` using the same `{t:'storm',v}` / `{t:'pirates',v}` messages. A disabled feature sends nothing and adds no gameplay behavior.

Hold NEW natural rain while `events.busy`; already-running rain must finish normally and blocks big event starts. Reject the fish weather drum while busy before charging tokens. `DEV_*=now` becomes pending at tick 600; ignores evening/minimum/count cooldown but respects active event and existing rain. If both requested, storm runs first and pirates waits until it has ended.

Per player simulation: preserve the actual input as `original`. Let `t=aquaClock(original.viewTick,p.aquaT,room.tick)` and eligibility be server-owned. `let inp=original; if(storm) inp=stormInput(state,inp,t,storm.view(),eligible); if(pirates) inp=pirateInput(state,inp,t,pirates.knockOf(pid));` Then existing `aquaDyn.pre → stepHeld(state,inp,...) → aquaDyn.post`; then `stormPush(state,world,t,view,eligible)` and `piratePush(state,world,t,knock)`, followed by existing drown check. The same composition and tick must be used in client Predictor's before/after hooks. Helpers return a masked **copy**; never modify the original input retained for replay.

When `BTN_FIRE` is set on real input and eligible, and pirates view phase is raid: call `pirates.swing(pid,original)`. This consumes the click for the mop; suppress conflicting kick/use behavior for that click. `swing` owns 30-tick cooldown, bounded rewind, target/cone/cover and retaliation. No client target ID, damage or reward accepted. Pressing E/action at lighthouse calls `storm.light(pid)`; it validates current eligibility, phase, duplicate profile, actual distance ≤1.8m and height ±.75m around `STORM_GOAL=(-19,0,40.8)`. Root chooses command routing; suggested client message `{t:'stormLight'}`.

Pirate snapshots: append after all existing lobby tails, only when PIRATES flag enabled; root owns offset discovery. `const tail=pirates.tail(viewer.pid); const n=tail.pirates.length; allocate pirateTailSize(n); writePirateTail(out,offset,tail)` returns end offset. Header18 bytes + 8 per actor (max16; max146 bytes). Header offsets: visible u8 at0/countu8 at1; chest x/z i16 centimetres at2/4; carrier u8 at6; waveu8 at7; selfknock at/until u32 at8/12; selfknock vx/vz i8 quarter-m/s at16/17. Actor: idu8,flagsu8(captain1/rage2/carry4),x/z i16cm,hpu8,yawu8. Hidden/ineligible viewers get no actors and visible=false. Decoder `readPirateTail(buf,offset,out)` returns end or −1; `emptyPirateTail()` allocates reusable target. No existing tail offset is changed by this worker; root integrates protocol9 batch.

State metadata shape from `server/lobby/events.ts`: `{stormAt,piratesAt,endedAt,lockUntil?}` epoch ms; lockUntil defaults0. On start, persist worst-case finish+30m lock BEFORE publishing; normal completion writes actual endedAt and lockUntil=now+30m. This prevents restarting mid-event into an immediately overlapping opposite event. Controller stats are passed as deltas: stStorms/stLights/prRaids/prWins/prKos. Store/Profile owner already added normalization/defaults.

## Client integration (root)

Client class APIs and verified behavior are listed below. Lighthouse builder provides `world.lighthouse={group,lampAnchor,setLampEnabled}` with world group(-19,0,43), lamp local y9.73. Goal at north door(-19,0,40.8) remains physically outside the tower. Root owns common input/scene integration and flags. After an explicit exclusive handoff, this worker also implemented the World climate/lamp adapters and quiet Sound event/critter methods. The harbor lighthouse builder itself was preserved.

### Final client APIs

- `new Storm3D(scene, hudRoot, { climate(dark,rain,flash,lampsOn), lamp(enabled), sound(kind), light(), lampPosition?, existingBeacon? })`; `.set(StormView)`; `.update(estimatedTick,dt,playerPosition,eligible,lowQuality=false)`; `.dispose()`. `existingBeacon` defaults true: use the real World beam. A standalone cone can be explicitly enabled with false, and appears only after successful lighting during calm. No illuminated beam is shown during the unlit storm.
- `new Pirates3D(scene,hudRoot,{swing(),sound(kind)})`; `.set(PirateView)`; `.setTail(PirateTail,serverTick)`; `.attachMop(localAvatarHandOrGroup)`; `.setDefenders(rows,localId)` with `{id,x,y,z,yaw,eligible}` rendered poses; `.swung(estimatedTick)`; `.update(estimatedTick,dt,camera,eligible,touch=false)`; `.dispose()`. Remote mops are two bounded instanced parts, local mop attaches to the current avatar. All pirate geometry, UI and mop hide for ineligible viewers.
- Root implemented the compatible `StepHook.before(...): Input | void` seam: Predictor uses the returned masked copy for physics and keeps the original input in its replay buffer. The new regression forces reconciliation during a wave and independently replays original inputs through the same helpers; final states match exactly.
- `LobbyWorld.setStormClimate(dark,rain,flash,lampsOn)` layers transient climate over ordinary `weather` without overwriting `weather.on`, overcast, rain or wet state. `effectiveRain` feeds the existing rain sound and RainFx. Darkening applies after the old/new-look weather palettes have rebuilt base uniforms. Lightning resets from those values and never compounds frame by frame.
- `LobbyWorld.setLighthouseEnabled(on)` toggles Tokarev lamp plus the old beam/flash. Local bulb/glow geometry, string lights, sign emission and point lights switch off during the storm; windows are in a separate retained glow batch. Point lights restore according to low/medium/high quality. Protected statue files/assets were not changed or reconstructed.
- `Sound.lobbyEvent(kind,pos?)` supports siren/thunder/wave/success/horn/cannon/splash/victory/loss/mop through existing master/effects/ambient buses. `Sound.purr(pos,hiss=false)` and `Sound.gullCry(pos)` support harbor critter callbacks. Existing `krakenScare` is preserved. All added cues have bounded quiet gain and no persistent source loop; suspended audio remains silent.

## Delivered rules and rendering

Storm: 60-second warning, at most 180 seconds active, first eligible E at the actual lighthouse door starts calm and a ten-second ranking window. Places pay 30/20/15/5 once, only if the player remains eligible/present at settlement. stStorms is counted once per encountered eligible profile, stLights once for the first lighter. Timeout gives no token reward. Calm lighting clears over 12 seconds; rainbow lasts 30 seconds. Waves every 360 ticks have 60 ticks of foam warning and 36 ticks of six-metre/second cross-pier collision-aware displacement/control lock. No force applies on the plaza, above the wave height band or to ineligible players.

Pirates: warning40s, raid≤240s, three cleared-wave transitions with four-second pauses; normal pirates have three HP, captain12 HP with rage after six hits. For 3–4 eligible defenders, waves have 4/6/7 actors (last includes captain); with six, 6/8/9; all counts cap at16. Scaling is sampled at each new wave. Static passability is baked from lobby boxes on a restricted central/east plaza grid, excluding the lighthouse/memorial approach entirely. One carrier moves at .85m/s, an escort within2.2m increases it to1.5m/s. Killing the carrier drops the chest in place with a one-second pickup grace; reaching the original landing loses the raid. No attack edits player health or removes player tokens.

Mop cooldown is30 ticks; range3.2m, forward cone half-angle60°, static segment cover, up to24 ticks of rewind for both attacker and actor. Retaliation is a quantized six-metre/second half-second displacement shared with the binary self tail; player input is masked via the shared helper. No client target IDs, hit counts or reward values are accepted. Reward participants must have landed at least one hit: two tokens per KO capped20, victory20, winning MVP10; one aggregate settlement and profile-based stat deltas. Pirate rewards remain profile-bound after leaving, while later attacks/visibility require current eligibility.

Models: one merged ship, three instanced boats, shared/instanced pirate bodies/bandannas/vest bands/eye patches/sabres, a larger captain with tricorn and metal hook, chest, local/remote mops, bounded tumbling defeat remnants, cosmetic cannonball and sea splash, victory fireworks. No physics from cannonballs. Actor animation stops beyond60m. Dynamic instances disable stale frustum bounds to avoid disappearing after movement. Storm uses one crest and low-cost foam, optional existing beacon and a translucent rainbow; no extra full-screen render pass.

## Fresh checks

Final command:

```
/opt/homebrew/bin/node --test test/storm.test.ts test/pirates.test.ts test/lobby-events-render.test.ts test/lobby-event-audio.test.ts test/lobby-event-climate.test.ts test/weather.test.ts
```

**22 passed, 0 failed, 0 skipped; exit0.** Full captured output `/tmp/events-final-check.log`.

Coverage includes schedule evening/human/rain rules, persisted per-event cooldowns and shared restart lock, dev queue mutual exclusion, wrong-position/height/ineligible lighthouse denial, rank and departed-player payout, timeout, real shared collision push outside the plaza, actual Predictor reconcile/replay, bounded pirate counts and binary truncation, hidden viewers, three exact hits/twelve captain hits/rage-six, all three waves to victory with payout cap, actual navigation to chest and physical carry-to-boat loss, drop grace, lag compensation with stale clamp, solid-cover denial, real Three geometry visibility/captain hook/low-quality warning, bounded audio bus/gain routing, and actual World climate/lighthouse methods restoring base rain/light.

The climate test substitutes only asset URL imports and bypasses heavy World/WebGL construction; it runs the real methods with real Three lights/fog/shader uniforms. Render tests use lightweight DOM substitutes. These prove logic/geometry/state, not pixels, audible mix or desktop FPS. Initial probe failures were corrected fixture issues (historical positions in repositioned test actors, URL query/binary loader support, and the fact that ordinary rain already has zero direct sunlight); they are not claimed as fixed gameplay defects.

Scoped TypeScript inspections found no diagnostics in the event modules, World adapter or Sound changes. Full project checks during parallel work had other in-progress integration diagnostics; root owns the final clean global gate. No server, browser, full suite, production/SSH, real data, new dependency or Git operation was performed by this worker.

## Ownership and remaining acceptance

New files: `shared/{storm,stormdyn,pirates,piratenet}.ts`, `server/lobby/{events,storm,pirates,piratenav}.ts`, `client/lobby/{storm,pirates}.ts`, `test/{storm,pirates,lobby-events-render,lobby-event-audio,lobby-event-climate}.test.ts`. Later explicit handoff: `client/lobby/world.ts`, `client/audio.ts`. Root/common server owners integrate messages, flags, snapshot offsets, room scheduling, weather/drum exclusion, eligibility, scene/input, stats/credit and persistence. This report and the two plans are the only documentation files edited here.

Root desktop acceptance still required: DEV_STORM and DEV_PIRATES complete scenarios; actual lamp/sign darkness in both looks; wave foam and displacement on the real pier; goal E and10-second rankings; rainbow/normal-weather return; raid win and chest-theft loss with two tabs; server-visible rewards/profile stats; held games hide pirates and prevent attacks; remote mops and touch button; listen to quiet cues and master mute; console/CSP; 16-actor desktop FPS against ordinary lobby and brief mobile compatibility. Root may append README/design notes from the rules above. No production readiness, measured visual fidelity, human difficulty acceptance or audio/FPS claim is made here.

# Integration contracts for the approved upgrade

Read `AGENTS.md`: desktop is primary; preserve basic mobile compatibility without extended mobile polish. Roman approved all game changes and later explicitly authorized deployment while preserving fishing achievements. Release20261002-215353 is deployed; see STATUS.md for final evidence. All subagents use `gpt-6.1-sol` / `max`.

## Latest approved addition: 32 species and a more valuable rain event

The October3 user addition supersedes the earlier30-species acceptance target below. Append exactly two species without changing existing species IDs: `bluemarlin` (Atlantic blue marlin, legendary, index34) and `greenlandshark` (Greenland shark, mythical, index35). Both are rain-event-only, use the same event sale multiplier1.5, and have distinct generated sprites. The mythical catch is the rarest event species, harder and more valuable than the legendary catch, while remaining catchable by the expert simulation.

The existing common `picarel` becomes event-only to provide unique event species in all five rarity categories; preserve its motion and common base price, apply the same event multiplier. Retain the other30-species balance work, recalibrate and report ordinary versus event income separately, and do not accelerate bite frequency to manufacture event value. Album/profile/full-collection reward must require32. Previously earned wardrobe rewards remain owned.

Rules worker additionally owns `shared/fishing.ts`; asset worker owns only new images and their provenance. UI and server consume the dynamic collection size. The requested `codex_cli` image capability is unavailable in this session; use the available built-in ImageGen and explicitly record the actual generator. Fast is requested; local Codex configuration already has `service_tier = "priority"`, with no model/reasoning downgrade.

## Ownership after restart

- Rules worker: `shared/fishrules.ts`, `shared/fishreel.ts`, new `shared/fishprogress.ts`, `test/fishbot.ts`, `test/fishing2.test.ts`, new rules/progression/balance tests. Do not edit persistence, protocol or UI.
- Server worker: fishing server, weather, board/podium persistence, `server/store.ts`, `server/profiles.ts`, `server/lobby/room.ts`, `server/hub.ts`, `shared/messages.ts`, `shared/economy.ts`, server-facing fishing tests. Own protocol additions. Do not edit rules, map or UI.
- Fishing UI worker: existing/new fishing client modules, NPC/board/podium visuals and modal, `client/lobby/scene.ts`, `client/scene.ts`, `client/ui/profile.ts`, `client/ui/fishbook.ts`, fishing CSS. Ask root for common `client/app.ts` edits; do not edit server or map.
- Geometry worker: `shared/maps/lobby.ts`, new `shared/fishplaces.ts`, dedicated fishing access/concurrency tests and physical deck/mooring visuals in a new client module consumed by UI worker. Do not edit fishing rules/server/UI state.
- Fortress worker: review and finish `shared/fort*`, `server/fort/*`, `client/fort/*`, fort tests. Source largely implemented. No fishing edits.
- Root: integration, common app/rendering, release evidence, full gates, desktop browser acceptance. No parallel edits to worker-owned files.

## Preserved baselines

Temporary `/tmp` files from the previous run are gone. Use the existing release-6 archive and extracted source at `/Users/tired/Desktop/tired.solutions/backups/release-6-source-baseline/game-opus`. Fishing rules, reel and fishbot files compared byte-for-byte equal to current unpatched fishing files on resume. Current partial upgrade is separately backed up as `backups/game-opus-2026-10-02-upgrade-resume.tar.gz`.

Measured before interruption, reproducible with the baseline `fishIncome(TYPICAL, false, 300)`: 13.465547 tokens/min fish only, rain16.994680, expert clear18.234026; chests4.478372 separate. User informed: +50% targets about20.2 from actual code, not the attachment's inaccurate old25–30 estimate. Common fish+75% is independent of that target and computed from original prices with integer rounding. Report measured final rates.

## Shared progression API (rules worker creates promptly)

`shared/fishprogress.ts` exports:

```ts
export type FishRod = 0 | 1 | 2 | 3;
export interface FishProgress {
  xp: number;
  questsDone: number;
  questCaught: number;
  rod: FishRod;
  beerUntil: number; // server wall clock milliseconds
}
export interface FishCastMods {
  level: number;
  rod: FishRod;
  zoneScale: number;
  biteSpeed: number;
  rareMultiplier: number;
  incomeScale: number;
}
export function emptyFishProgress(): FishProgress;
export function normalizeFishProgress(raw: unknown): FishProgress;
export function fishLevel(xp: number): number; // novice0, earned levels1..10
export function fishLevelView(xp: number): { level: number; xp: number; from: number; next: number | null };
export function questNeed(questsDone: number): number; // 5*(done+1)
export function unlockedRod(questsDone: number): FishRod; // thresholds1,5,10
export function rodBonus(rod: FishRod): number; // 0/.1/.2/.3
export function fishCastMods(progress: FishProgress, now: number): FishCastMods;
export const BEER_PRICE: number; //15
export const BEER_MS: number; //600000
export const RAIN_DRUM_PRICE: number; //500
```

The rules worker also exposes `fishCatchXp(sp, perfect?)`, a deterministic `reelStyleFor(sp, mods)` helper and optional modifier arguments to `rollCatch2` and `fishPrice2` while preserving existing callers. Publish exact signatures here or in the worker report before clients use them. Modifiers are snapshotted server-side at cast start and transmitted with hook/reel state. Expiry during that cast does not alter its deterministic replay or reward; subsequent casts use current buffs. Rods do not stack with one another. Level bonus multiplies zone width by1+.025*level; rod adds its independent zone multiplier and bite-rate multiplier. No other reel parameter changes from level.

## Server and UI protocol (server worker owns)

- Profile has `fishing: FishProgress`, safely defaulted for old saves; server `me` message includes `fishing`. Root mirrors it in app MeState.
- Client NPC request: `{t:'fishNpc', a:'open'|'beer'|'rain'|'claim'|'rod', rod?:number}`. Server checks lobby presence, proximity to fisherman, balances/eligibility and integer rod ownership; no client prices or XP accepted.
- Server state/update: `{t:'fishProgress', progress:FishProgress, now:number}`.
- Server NPC response: `{t:'fishNpc', progress:FishProgress, now:number, open?:boolean, message?:string}`. Rejected purchases update message without spending.
- Server global event: `{t:'fishEvent', on:boolean, until:number}` using wall-clock end time. Same normal/forced weather path. Root displays notification in every room; lobby shows event state.
- Server worker adds cast modifiers to hook/rejoin protocol and tells UI worker exact fields.
- Rebuy active beer: reject without spending; no stacking. Rain drum during current rain: reject without spending. New rain uses existing weather event with doubled normal duration.
- Quests: count actual fish only; NPC claim pays `questNeed(done)*5` exactly once, increments done, unlocks/equips best newly earned rod. Surplus catches carry forward after subtracting current requirement. Rod selection allows one earned rod at a time.
- Event multiplier applies to unique event fish as the attachment specifies; UI wording must state this scope clearly. Beer multiplies fish sale only, not treasure, quest reward, discovery bonus or other games.
- Podium stores the top3 individual catches, allowing multiple catches from one player, with stable tie ordering and Moscow-day rollover. Existing four leaderboard lists remain.

## Geometry and visuals contract

Geometry worker owns `shared/fishplaces.ts`, exports agreed named positions and bounds for NPC/board/podium so UI and server share them. Proposed positions to validate and finalize:

- Fisherman: exact old board site x=-15.5,z=37.72, facing north; add reachable wood deck joined to pier and lighthouse, roughly x[-17,-14],z[36.3,38.2]. Interaction point in front near(-15.5,36.5), radius1.7.
- Board: near(-15,20.8), facing north. This is left when walking south toward lighthouse, avoids memorial on west.
- Podium: near(-11.5,19.75), footprint about2.5×1.3, verify bench at(-8,19.5) and bollard(-12,21.2).
- Existing six fishing spots remain exactly their old positions and IDs. Add2 main-pier side-bay spots around z34–35 if needed to avoid photo tripod and NPC casting lines. Add4 lighthouse spots, avoiding decorative fishermen(-14.6,40.3),(-23.4,43.6) and their gear.
- Append new interactables at map end so existing IDs remain stable. New NPC kind name `fisher`, shared use point defined by geometry worker; server NPC request still validates distance independently.
- Do not alter the memorial, statue source/assets, old photo interaction, old six spots, or block passage. Each new spot must support approach→use→cast→reel→catch→exit; test all6 and12 simultaneous occupants.

Three generated rod assets already exist in `client/assets/rods/{advanced,professional,master}.png`; preserve images/provenance and integrate them. No further image generation needed.

## Evidence and workflow

Reports belong here in `docs/release-prep/2026-10-02/REPORT-<area>.md` and are updated at each completed stage. First acknowledgement should state bounded ownership. Do not spend long periods without a checkpoint. Run only owned tests while others edit; root runs complete checks/build/tests after integration. No persistent real data in tests and no secrets in logs. No server/browser started by workers unless root assigns a unique port explicitly.

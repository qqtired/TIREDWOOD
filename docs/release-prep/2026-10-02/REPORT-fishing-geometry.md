# Fishing geometry checkpoint

Owned files: `shared/maps/lobby.ts`, new `shared/fishplaces.ts`, new `client/lobby/fishplaces3d.ts`, dedicated geometry/access/concurrency tests. No memorial/statue, sibling game, real persistence, commits, deployment, server runtime or browser changes.

The source directory is not a Git checkout (`git status` returned exit128). Existing release-6 source is preserved under `backups/release-6-source-baseline/game-opus`. The old six spot positions and all 46 existing interaction IDs are pinned in tests.

## Frozen coordinates

| arg | interaction ID | zone | x | z | casts toward |
|---:|---:|---|---:|---:|---|
|0|35|pier|-20.45|25|west|
|1|36|pier|-17.55|25|east|
|2|37|pier|-20.45|28.5|west|
|3|38|pier|-17.55|28.5|east|
|4|39|pier|-20.45|32|west|
|5|40|pier|-17.55|32|east|
|6|46|pier side bay|-22|34.4|west|
|7|47|pier side bay|-16|34.4|east|
|8|48|lighthouse|-23.45|41|west|
|9|49|lighthouse|-14.55|42.5|east|
|10|50|lighthouse|-21.65|45.45|south|
|11|51|lighthouse|-16.35|45.45|south|

The NPC keeps the exact old board site: `(-15.5,0,37.72)`, north-facing. His front use point is `(-15.5,0,36.5)`, radius1.7, south-facing; `kind:'fisher'`, interaction ID52. Board: `(-15,0,20.8)`, north-facing, width3.6/depth0.16/height2.45. Podium: `(-11.5,0,19.75)`, width2.5/depth1.3/base height0.28. Shared bounds accompany all three.

New wood floors meet the original floor at y=0 without gaps or intersecting floor volumes: west side bay x[-22.6,-21],z[33.4,35.4]; east bay x[-17,-15.4],z[33.4,35.4]; NPC annex x[-17,-14],z[36,38]. NPC annex reaches both the pier and lighthouse platform. Map/player-navigation bounds remain x[-30,30],z[-26,46]; southern fishing feet fit within z46. Sea guard wall remains z48. All old map boxes are retained unchanged before the appended geometry.

`addFishPlaces3d(parent:THREE.Object3D):void` adds batched under-floor timber, pilings and six modest mooring posts/coils. Floor surfaces render from authoritative map boxes. Mooring post colliders match their visible radius/height; no rail or rope crosses the passages.

## Checkpoint verification

`/opt/homebrew/bin/node --test test/fishplaces.test.ts`: **4/4 passed** after an expected failing first run (6vs12 spots; missing side-bay support).

Verified: exact old six coordinates; stable old interaction IDs; total8pier+4lighthouse; full foot support; no avatar AABB overlap; each new route from/to pier entry sampled every0.1m; all 12 casting endpoints in water; separation from old interactions, photo tripod, decorative fishermen/buckets/gear, bollards, memorial side and tower. Lighthouse approach turns west only after the whole avatar reaches the concrete deck (z38.5); a diagonal corner cut would leave a foot over water and is excluded.

Remaining at this checkpoint: drive real server approach→use→cast→reel→catch→exit at each new point; test 12 concurrent occupants, preserve legacy fishing fallback, inspect final diff against release6. The next section records completion of these checks. Desktop browser acceptance belongs to root; mobile has not been examined by this worker.

## Final mechanical verification (2026-10-03)

- `/opt/homebrew/bin/node --test test/fishplaces.test.ts test/fishaccess.test.ts`: **14/14 passed,0failures**. This includes six separate full cycles, simultaneous12-player cycles, one-occupant authority and a thirteenth player's immediate admission after release, all12 legacy cycles with FISH2off, physical visibility regression and five geometry contracts.
- Scoped TypeScript check for all owned production/test files passed (Node24, bundled TypeScript, `--ignoreConfig --noEmit --strict --noUnusedLocals`, ES2023/Bundler/DOM settings matching the project). Root still runs the complete project check/build/test gate after integration.
- Independent comparison with release6: all46old `Interactable` objects and150old map boxes are deeply equal; all old deco, bounds, benches, lighthouse, boat boxes/area and aqua mover indices are unchanged. Exactly14boxes and7interactables appended. All five statue source/assets are byte-for-byte equal to baseline: `statue.ts`, `statueFormat.ts`, `body.webp`, `head.webp`, `statue.bin`; `STATUE` and `PHOTO` coordinates/parameters are deeply equal.
- Client scene construction smoke: one new geometry group, two static batches,8208vertices; no new per-frame geometry or simulation. The UI worker independently integrates `addFishPlaces3d(world.scene)` and consumes the shared positions.

Tests initialise a fresh player only at pier entry `(-19,22.6)`; they reach each subsequent waypoint through `sendInput`/binary input packets, actual Hub ticks and normal grounded movement. Every movement tick checks full foot support, avatar AABB freedom and passage past seated fishermen. E uses the real interaction ID. A deterministic server draw chooses scad300g, but the server runs its actual bite/hook/reel/catch code: the client receives the cast endpoint and hook seed/mods, `playReel(reelStyleFor(sp,mods),seed,EXPERT)` supplies honest toggles every15ticks, server wall time advances per tick, `fishLand`, album, counter and positive price are asserted. The server's actual cast endpoint is in water. Exiting uses normal walking along the reverse route and asserts the spot is immediately free. Twelve players repeat this concurrently and each receives an individual catch.

FISH2off regression was reproduced with a failing test: hidden NPC/board/podium kept solid colliders. `LobbyMap.fishPropsBoxes` now identifies only five gated props boxes, currently indices159..163 (consumers use the array, not literal indices). Server worker toggles them off in the room constructor for `!hub.fish2`; UI worker starts them disabled and toggles on welcome in parallel with visibility. Floors and six visible mooring posts remain active in both modes. The new regression test passed after integration. Board panel/post collisions were also matched to actual visible frame dimensions, with a failing then passing physical-post test; placements remained frozen. NPC only inspects a short line near his hands and does not cast north through player spots.

## Exact routes for root desktop acceptance

`P=(-19,22.6)`. For lighthouse approaches, `L=P→(-19,33.3)→(-20.2,33.3)→(-20.2,38.5)→(-21.5,39.3)`; the west step happens after reaching the concrete floor. Feet y=0 throughout, no jump or dash required. The same sequence is traversed in reverse after each catch.

| new arg / ID | tested approach sequence | tested cycle |
|---|---|---|
|6 /46|P→(-19,34.4)→(-22,34.4)|E→cast→bite→hook seed→honest reel→scad300g→walk back→vacant|
|7 /47|P→(-19,34.4)→(-16,34.4)|E→cast→bite→hook seed→honest reel→scad300g→walk back→vacant|
|8 /48|L→(-22.3,41)→(-23.45,41)|E→cast→bite→hook seed→honest reel→scad300g→walk back→vacant|
|9 /49|L→(-21.5,40.9)→(-16.3,40.9)→(-16.3,42.5)→(-14.55,42.5)|E→cast→bite→hook seed→honest reel→scad300g→walk back→vacant|
|10 /50|L→(-21.65,41)→(-21.65,45.45)|E→cast→bite→hook seed→honest reel→scad300g→walk back→vacant|
|11 /51|L→(-21.5,40.9)→(-16.3,40.9)→(-16.35,45.45)|E→cast→bite→hook seed→honest reel→scad300g→walk back→vacant|

NPC approach: P→(-19,33.3)→(-17.8,33.3)→(-17.8,36.5)→(-15.5,36.5), looking south. Board readable approach is `(-15,19.4)`, looking south; podium approach `(-11.5,18.2)`. Main pier entry `(-19,20.8)` stays clear. Camera interaction remains ID34 at `(-19,34.4)`; its tripod stays at `(-19,35.3)`, photo pose at `(-19,39.6)`. Lighthouse platform remains x[-24,-14],z[38,46], tower x[-20.6,-17.4],z[41.4,44.6].

Desktop browser/visual acceptance, broad release gates and a short mobile compatibility smoke remain root's responsibility. Automated server/geometry checks prove the local mechanical paths; no browser acceptance, production delivery, real multi-user network load or physical mobile device acceptance is claimed by this worker.

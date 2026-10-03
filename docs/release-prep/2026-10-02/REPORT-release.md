# Release 20261002-215353 — deployed and checked

Production: https://game.tired.solutions/ . Authorized by Roman's explicit request to release and preserve existing fishing progress. All delegated workers used gpt-6.1-sol/max; existing service_tier=priority retained. Desktop was primary throughout, as recorded in AGENTS.md.

## Candidate and gates

- Runtime payload: `backups/game-opus-20261002-215353/game-opus-20261002-215353.tar.gz`, SHA256 `37813e80b5e016ff674539d2d1981593c50455079669730437025cd84a6592ae`.
- Built/public index.html SHA256: `af03e157cc8354b044584d39762fe776e4ae81c23144f2668424e73135f06bc9`; served JS: `index-c7f64NhK.js`.
- Explicit Node24.15.0; npm run check exit0, npm test544passed/0failed/0skipped, npm run build exit0, compression6files. Full logs retained in the sibling backup directory.
- The first integrated test run exposed one stale map test using slice(-5). Old IDs41–45 now correctly remain in their original positions before the appended interactions46–52. The test was corrected to pin41–45; targeted6tests and full544tests passed. Runtime mapping was already correct.
- CSP gate now fails for browser errors, policy violations, wrong expected feature flags and missing desktop entry. The actual built game passed with FORTRESS/FIGHT/FISH2 all true. Evidence: `evidence/csp/result.json` and `evidence/csp/lobby.jpg`.

## Desktop acceptance

Production-mode local server used isolated synthetic data, never real player profiles. The advanced QA profile was deliberately seeded with1500tokens, existing32album entries, level8, quest10 and master rod; those seeded achievements are not claimed as earned through a full human playthrough.

- Actual mouse/keyboard entry and server-authorized NPC interaction at the former board site. Beer1500→1485, rain1485→985, quest11 reward985→1260; questCaught55→0, quests10→11. Active buffs disable repurchase. Timer/event UI matched server messages; CSP remained empty.
- Album has exactly32cards within the open dialog (a separate hidden profile grid also exists), both new sprites loaded, no clipped fish names. Generated rods displayed in the NPC dialog. NPC, board/podium and six additions were visually inspected.
- Walked every new point with client input and ordinary server movement, y=0. Separate real-Hub tests cover all6complete cycles and12simultaneous fishers. Browser end-to-end at lighthouse spot11 used real cast, bite, hook, visible reel with a scripted hold/release controller and server replay: mackerel495g, +8tokens, XP6900→6960, questCaught0→1, collectionreward delivered, then walked out with spot released. This is automated browser acceptance, not a human catch.
- Fight: entered through the circle; first-person view and own-body hiding observed.12rendered frames had0yaw difference between input and eye. Real mouse attack enteredact1; the right fist advanced from rest towardcontact (z≈−1.23), screenshot retained. Defeat/results and lobby return observed.
- Fight presets changed live: high2MSAA/196crowd, medium0MSAA/159crowd, low0MSAA/102crowd with reduced resolution. Warm samples at1440×900 had median6.1ms/p95about6.7ms on this machine. These short controlled samples do not prove fleetwide FPS gain; first scene entry had a one-time shader/setup stall around135ms. No sustained severe FPS collapse was reproduced locally.
- Fortress actual portal, world,50point starting balance, shop layout and availability observed. The attempted automated buy used a mismatching accessible-name selector and did not establish a browser purchase. Purchases, funds, phases, assistance,42magazine/reload andAAare exercised by the51focused tests. Boss/flyer/marks/lowquality/deadbossHUD were visually checked in a clearly labeled real-renderer snapshot fixture, not a completed8-wave human match.
- All32rarity/difficulty and economy simulations passed. Final novice/no-buff fish sales20.717844/min vs old13.465547 (+53.8582%); event28.537762 (+37.7448%overnewclear). Claims add11.840691/min only over fully completed quest cycles, separately from sale/chests/discoveries. Expert model catches Greenland shark57.83% of hooked reels; it remains rarest event fish. Full tables are in REPORT-fishing-rules.md and BALANCE-fishing-rules-32.json.

Screenshots are in `evidence/desktop/`. Earlier `/tmp` browser/command artifacts are not the only evidence copy.

## Protected production change

The usual installer would roll back only the code symlink and prune old releases. For this authorized migration, executed a bounded operator script retaining old releases and making a consistent backup while the service was stopped. Copies of the actual operator/check scripts are in the sibling release backup directory; no infrastructure or authentication settings were changed.

1. Loaded the existing SSH identity from macOS Keychain without exposing its passphrase. Initial locked-agent authentication failure caused no server change.
2. Verified productionNode24.15.0, healthy service, available disk and idle game modes. Six people were in the lobby and busy=0immediately before the controlled restart.
3. Verified uploaded payload checksum, staged it and installed its one productiondependency while the old service still ran. Candidate normalization of current saved profiles passed without writing to live data.
4. Gracefully stopped/flushed old service; retained full data archive, previous release archive, unit and raw pre-upgrade state under root-only `/var/backups/game-opus/20261002-215353-preupgrade`. Gzip/SHA checks passed. Re-ran normalization against this exact consistent snapshot.
5. Switched to `/opt/game-opus/releases/20261002-215353`, installed its unit, started and checked health plus authenticatedWebSocket smoke (me,scene,binarysnapshot) without a new player profile.
6. Compared actual live data against pre-upgrade state immediately and again after players reconnected. Both passes preserved44profiles,245albumentries,48owneditems and352existingfishingcounterchecks; zero failures.16profiles had albums. Exact balance/outfit preservation was also verified during preflight. No prior fishing progress objects existed; XP/quests/rods are new fields, not reset old fields.
7. PublicHTTP200andproductionCSPreturned; publicindexbytes match build; actual public browser loaded thatJS without console errors. Later publichealth observed3people back in the lobby. All private backup checksums revalidated.

Existing collection outfits stay owned even when an old30/30collection now displays30/32. The new reward threshold is32for profiles that have not already earned it. Current early schema and album identifiers remain compatible forward.

No rollback was needed. Synthetic37-assertion rehearsal proved that old code drops new fields and new species during save; a future rollback must pair compatible code/data and preserve displaced live state. A pre-upgrade snapshot cannot restore activity earned after its cutoff. Do not run a code-only downgrade and claim progress is safe.

## Limits and handoff

Full8-wave human balancing, a6-human network/GPU load test and real mobile hardware were not exercised. A late short844×390mobile attempt timed out before finding its login input in an isolated test context; no success is claimed for it. Existing mobile logic tests pass; desktop priority does not imply a real-phone guarantee.

The new fish and rod artworks were generated with available built-inImageGen because callablecodex_cliwas unavailable. Exact original prompts, originals and hashes are retained in the asset provenance. Generation is real; the requested unavailable tool name is not falsely claimed.

This folder's earlier worker checklists describe preparation snapshots. STATUS.md and this report are the final deployment outcome. No real profiles, authentication hashes, tokens or private backups were copied into these local reports.

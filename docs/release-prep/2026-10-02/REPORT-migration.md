# Synthetic migration, backup and restore rehearsal

Forward migration and exact candidate-snapshot recovery passed **37 assertions**. A code-only rollback to release6 is **lossy**: its first save removes new fishing progress, five new stats, both new species' album entries and all three individual podium catches. Returning to candidate code does not recreate that information.

This is local schema/persistence evidence, not deployment or runtime acceptance. The only additions are `tools/release/migration-rehearsal.ts`, this report and compact `MIGRATION-rehearsal.json`. No game source, production data, project `data/`, server/browser or network was touched. No temporary directory was removed. `git status --short` confirms the workspace is non-Git.

## Reproduce

From `/Users/tired/Desktop/tired.solutions/game-opus`:

```sh
/opt/homebrew/bin/node tools/release/migration-rehearsal.ts
```

The script imports the current candidate Store and the actual preserved original Store from `../backups/release-6-source-baseline/game-opus/server/store.ts`. It takes no data-directory argument and always creates a fresh `/tmp/opus-migration-rehearsal-*` directory. Every loaded/saved state is generated synthetic data; there are no device credentials. A compact summary prints the retained evidence path. The baseline must remain available beside this checkout; this tool is for local release preparation.

Recorded final run: UTC `2026-10-02T21:35:42.481Z`, Node `v24.15.0`, synthetic checkpoint time `2026-10-03T12:00:00.000Z`. Evidence: `MIGRATION-rehearsal.json` (7549bytes); full runtime fixtures remain at `/tmp/opus-migration-rehearsal-oLx7oX`. An earlier36-assertion run also remains at `/tmp/opus-migration-rehearsal-rnpXZ0`; the final run adds absolute beer-expiry verification and complete later-counter differences. The scoped strict TypeScript check of the rehearsal script passed.

## Verified forward path

The original release6 Store created and serialized two profiles: a rich profile with4321tokens, a non-default owned outfit, five old album entries and nonzero values in every old stat; and a minimal old profile normalised by that original code with27tokens. Both have13old profile fields and34old statistic keys. Global jackpot, last jackpot, respects and aqua records were also retained.

| stage | observed result |
|---|---|
|Original release6 save→candidate load|All known old profile/global fields, tokens, owned/outfit, old album entries and34old counters match exactly. Missing progress defaults to zero; new activity/reward counters default to zero. Primary maximum weight reconstructs as700000g from the old album; secondary maximum is0. No podium is invented from aggregated history.|
|Candidate populate new fields→save→reload|Complete state matches exactly: primary XP7800, questsDone10, questCaught17, master rod3, absolute beer expiry; secondary XP380, one quest, rod1; all five new stats; both new event species' album entries; three individual podium records from the same player.|
|Candidate saved state→daily backup→retained copy|All three files have the same SHA-256. Candidate backup copied from `candidate-live/backups/state-2026-10-03.json` to a separate fresh directory before the backward path.|

The current table has36fish rows /32collectible species. The script discovers appended IDs dynamically by comparing original and candidate tables: `bluemarlin` at34 and `greenlandshark` at35. The five new stat keys are `fsCasts`, `fsBites`, `fsLost`, `fsMaxGrams`, `fsEarned`. Source hashes for both parser versions and their relevant shared dependencies are recorded in the JSON evidence.

## Measured code-only rollback loss

The original parser accepts candidate data because both serializers still use `v:1`. Acceptance does not mean it preserves unknown fields. The rehearsal loads the candidate checkpoint through the original Store, calls its real `markDirty()/flush()`, then loads/saves that file through candidate code.

| data | candidate checkpoint | after original save and candidate reload |
|---|---|---|
|Original tokens/outfit/old albums/34old stats/globals|4321and27tokens; populated old records|Exactly preserved|
|Primary progression|XP7800; quests10; caught17; rod3; active beer|XP0; quests0; caught0; rod0; beerUntil0|
|Secondary progression|XP380; quests1; caught8; rod1|All zero|
|Primary new activity/reward counters|casts137; bites124; lost17; earned987|All zero|
|Secondary new activity/reward counters|casts7; bites6; lost1; earned71|All zero|
|Primary maximum weight|1260000g, including a caught/sold record larger than album|700000g reconstructed only from surviving old album;560000g of the best record lost|
|Secondary maximum weight|400g from a prior catch absent from album|0|
|New album record `bluemarlin`|350000g, count1|Removed|
|New album record `greenlandshark`|825000g, count2|Removed|
|Individual daily podium|Three catches|Empty day and catches|

The old serialized file drops two progression objects containing10scalar fields, ten new statistic fields across two profiles, two candidate-only album records and the complete podium object containing three catches. Candidate reloading restores safe defaults and the surviving album maximum; this is partial reconstruction, not recovery of lost history. Saved new quest/rod entitlement and active beer cannot be derived from old catch totals.

## Backup restore and rollback implications

The retained candidate backup hash is `041ab3d230eac398f316148d0bfb0df359cf6ec60e96f0fa1c97fe537a11d7db`. A copied snapshot was restored into a **new** directory, loaded by candidate code, flushed and reloaded. Full parsed state and serialized file bytes both exactly match the checkpoint. Progress, new species, every counter and all three podium rows recover together. At simulated restore time one minute later, the absolute beer expiry remains unchanged and540000ms remain; restoration does not restart the ten-minute duration.

The rehearsal deliberately created valid later activity after the backup: +19tokens, +250XP, +1quest catch, +1cast/bite/caught fish, +1302000g total caught weight, +42000g maximum, +19fish-earned tokens, a new1302000g Greenland-shark album/podium catch and +1respect. Exact snapshot restoration discards all of that later activity. The JSON contains before/after values for every changed counter and the affected album/podium. A latest daily backup is not necessarily the latest state: this Store creates only the first save for a Moscow day; later same-day saves leave that daily backup unchanged, as verified here.

| chosen recovery | data boundary |
|---|---|
|Original code with candidate data|Preserves old fields but drops new progress on the first save; code symlink rollback alone is insufficient.|
|Original code with a pre-upgrade full data snapshot|Restores the older schema and activity as of that snapshot; all later tokens/rewards/progress need an explicit loss decision.|
|Candidate code with a compatible candidate snapshot|Recovers the full candidate schema exactly at the snapshot; later activity is still lost. Keeping old code afterward would discard new fields again.|

Before an authorised production change, agree a maintenance window and the snapshot's cutoff/lost-activity policy. Stop new game admission, allow or end active sessions according to that agreement, gracefully stop and flush the service, then archive the compatible code/unit/data snapshot and verify its checksum. For a restore, keep the displaced current data intact, restore into a new directory, pair it with the compatible code and independently verify identity, balances/progress and essential gameplay before resuming admission. The existing runbook describes those operator actions; none were executed here. Neither an automatic installer symlink rollback nor a daily backup should be presented as data-preserving without this explicit choice.

Remaining acceptance belongs to root: final source/build/protocol gates, browser/reconnect checks and any subsequently authorised production backup/deployment. This rehearsal does not validate crash consistency under concurrent writers, corrupt-file recovery, filesystem ownership, service shutdown, real network clients or production backup availability.

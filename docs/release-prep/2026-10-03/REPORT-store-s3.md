# S3 — Store failure handling and migration review

Scope is local `server/store.ts` and `test/store-recovery.test.ts`. No SSH, production state reads/writes, full gate, server start or build. Current file was captured before changes at `/tmp/game-opus-store-before-s3.ts`; the source diff was independently inspected.

## S3 result

- A corrupt/unreadable existing primary without a usable daily backup now throws a generic startup error. The failed Store also rejects `markDirty`, `flush` and `close`, preventing a caller that catches the load error from writing its default empty state.
- A genuinely new empty DATA_DIR still initializes normally. Missing primary with a valid backup restores it. Missing primary with an old `state.json.corrupt-*` or atomic `state.json.tmp` artifact is treated as existing-data loss, not a first launch. Dangling symlinks are detected with `lstatSync`.
- Existing primary is moved aside only after a valid replacement has been parsed. Without one it stays untouched at the original path. Aside filename collisions preserve earlier artifacts. Unreadable backup inventory is not treated as an empty inventory.
- The newest usable copy wins when later copies are corrupt. Operator output names its date, Moscow calendar-day age and explicit rollback. JSON parser/IO exception text is not emitted, because it can contain profile bytes or private paths.
- Atomic write failure returns a generic error and leaves pending state dirty for an explicit retry. In the tested refusal before writing the primary, prior bytes remain unchanged.

Red before changes: 7/8 new regressions failed; fresh-directory initialization was already passing. Green final scoped command:

`/opt/homebrew/bin/node --test test/store-recovery.test.ts test/store.test.ts test/fishing-migration-review.test.ts test/levels.test.ts`

Result: **22 passed, 0 failed, 0 skipped**. The new tests exercise real temporary files, invalid JSON/all invalid copies, newest-invalid/older-valid fallback, absent-primary recovery, remnants, EISDIR/unreadable entry, dangling link, blocked backup-directory creation and atomic write refusal/retry. The whole synthetic recovery state is compared, including album, every stat, money, wardrobe, progression markers and both escrows.

Scoped TS7 compilation with current project compiler flags against Store and these four test files: **exit0**. Root owns the full integrated gate and production release.

## Current candidate migration, unchanged by S3

The current state normalizer is private `parseState`, rather than a separate `normalizeState` export. Byte comparison before/after the S3 patch confirms `normalizeProfile`, `parseState` and both Profile/State interfaces are identical.

| Input at first candidate load | Expected candidate behavior |
| --- | --- |
| `fishingResetVersion` absent or below1 | Set `fishing.xp`, `questsDone`, `questCaught`, `rod` to0 and write marker1. Keep `beerUntil`, album, fish counters/max/earnings, clothing and tokens subject to their existing normalizers. |
| `fishingResetVersion >=1` | Preserve normalized new fishing progress. Subsequent save/load does not reset it again. |
| `levelsVersion` absent or below1 | Backfill general XP once from existing gameplay counters; derive general level from XP and write marker1. No casino/balance-derived XP. |
| `levelsVersion >=1` | Preserve sanitized general XP and recompute level from it; history is not added again. |
| Valid balances/auth/wardrobe/history | Retain profile IDs, keys, nick, balances, owned items, valid outfit, album, old stats, dates and punishment timers. New missing counters take their established defaults. |
| Same aquapark course | Preserve course board and personal records. If course version differs, established behavior clears the incompatible board/personal best; this was not changed. |
| Valid stored fish podium/event deadlines | Preserve normalized entries (current podium cap5) and persisted global event fields. Runtime day rollover/expired-buff/event handling is separate from the loader. |
| Escrow | Store preserves valid Blackjack/Durak escrow. The existing Profiles constructor then refunds each reserved amount once, clears escrow and flushes it. With no escrow, it makes no refund balance change. |

Historical general XP formula is `20*rcRaces +15*pbRounds +20*dkGames +3*max(fsCaught,fsFish) +5*aqRuns +20*ftGames +15*fcFights`, passed through `safeXp`. Fishing skill XP is independent and resets only by its own marker.

Root supplied current production aggregates:47 profiles, no reset/level markers, no escrow and aquaCourse2. From those supplied aggregates and the checked candidate code, all47 profiles are expected to receive the authorized one-time four-field fishing reset plus general XP backfill, without escrow refunds. These production aggregates were not independently read by this worker; root's private-copy retention check verifies actual protected fields before startup.

## Freeze and limits

No normalization/schema/Profiles/migration semantics changed. No new fallback store, sidecar, maintenance service or remote action was added. Local owned code is frozen for root's integrated gate.

An incorrect completely empty DATA_DIR has no local evidence of prior data and still qualifies as first initialization; root must keep its existing release check on the intended data path. Recovery from an older backup is an explicit data rollback and can discard activity after that checkpoint. A later failure writing the backup can occur after primary commit under the existing save sequence; S3 does not introduce a multi-file transaction. Physical disk-full/fsync failures and production permissions were not exercised; deterministic filesystem refusal cases above were.

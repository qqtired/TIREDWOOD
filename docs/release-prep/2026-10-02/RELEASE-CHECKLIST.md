# Game Opus upgrade — release preparation checklist

**Status: local release preparation; complete game gates, runtime acceptance and deployment are pending.** This checklist records source inspection on 2026-10-03 while implementation workers are still active. The focused release-safety checks in section 9 have run; they do not prove the integrated upgrade passes its gates. Roman authorized implementation and local release preparation; deployment, production configuration changes, commits and pushes require a separate explicit request.

Desktop keyboard/mouse acceptance is primary ([AGENTS.md](../../../AGENTS.md)). Keep a short mobile compatibility check and label emulation separately from a real device. The final requirements and ownership are in [CONTRACTS.md](./CONTRACTS.md) and the [upgrade plan](../../superpowers/plans/2026-10-02-combat-fortress-fishing-upgrade.md).

| Stage | Present evidence | Required before the next stage |
|---|---|---|
| Preparation | Source/scripts inspected; commands and acceptance matrix below | Finish all owned changes and root integration |
| Automated acceptance | Focused release-safety checks pass; complete game gate pending | Fresh Node 24 typecheck, complete tests, production build and compression against the integrated state |
| Local runtime acceptance | Not run by this checklist worker | Production flags, production CSP, migration/reconnect and desktop matrix; retain evidence |
| Human acceptance | Pending | Roman reviews the resulting local preview and material limits |
| Deployment authorization | Not granted | Explicit deployment request, approved maintenance/backup/rollback choices |
| Production acceptance | Not inspected or run | Approved release installation plus live checks; local evidence does not substitute for this stage |

## 1. Freeze the candidate and use Node 24

- [ ] All workers finish; root independently inspects their changes against the preserved release-6 baseline and reviews their actual test results. Do not run the complete gate against a partial shared state.
- [ ] Record the integrated source archive/hash and final worker reports. This directory is **not a Git checkout** (`git status --short` returns exit 128); a commit or clean Git status cannot identify this candidate. Preserve `../backups/release-6-source-baseline/game-opus` and `../backups/game-opus-2026-10-02-upgrade-resume.tar.gz`.
- [ ] Select Node 24 explicitly. During inspection the default shell used `/Users/tired/.local/bin/node` **v22.22.3**; `/opt/homebrew/opt/node@24/bin/node` was **v24.15.0**. Package engines require `>=24`; the production installer names `v24.15.0`.

Run these commands only after integration; record exact exit codes and logs outside the source tree:

```sh
set -eu
cd /Users/tired/Desktop/tired.solutions/game-opus
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Node 24 required"); console.log(process.version)'
npm --version
OPUS_EVIDENCE=$(mktemp -d "${TMPDIR:-/tmp}/opus-release-evidence.XXXXXX")
chmod 700 "$OPUS_EVIDENCE"
OPUS_GATE_DATA=$(mktemp -d "${TMPDIR:-/tmp}/opus-release-gates.XXXXXX")
export DATA_DIR="$OPUS_GATE_DATA"
npm run check
npm test
npm run build
node deploy/compress.ts
```

The required scripts are exactly `tsc --noEmit -p .`, `node --test "test/*.test.ts"`, `vite build`, then `node deploy/compress.ts` ([package.json](../../../package.json), [deploy.sh](../../../deploy.sh)). If dependencies need a clean installation, prepare them from the lockfile with `npm ci --ignore-scripts --no-audit --no-fund` before the gate; do not refresh dependency versions as part of this release.

- [ ] All four commands succeed. Save compact results plus full logs; capture a noisy command's real exit status rather than the status of a pipe/tail. The `test/*.test.ts` glob includes newly added tests; do not reuse README's historical test count.
- [ ] `dist/` is the build from this exact candidate; `deploy/compress.ts` creates `.gz` siblings for eligible text/model files of at least 1024 bytes. Test gzip integrity and retain the uncompressed originals.
- [ ] After the last source change rerun the relevant failed/affected checks and required final gate. A worker's owned tests or an earlier green build do not certify the integrated candidate.

Prepare the exact release payload locally after the gate; this command performs no upload:

```sh
OPUS_RELEASE_ID=$(date -u '+%Y%m%d-%H%M%S')
OPUS_BUNDLE="$OPUS_EVIDENCE/game-opus-$OPUS_RELEASE_ID.tar.gz"
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$OPUS_BUNDLE" \
  package.json package-lock.json server shared dist deploy
gzip -t "$OPUS_BUNDLE"
shasum -a 256 "$OPUS_BUNDLE" > "$OPUS_BUNDLE.sha256"
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$OPUS_EVIDENCE/source.tar.gz" \
  AGENTS.md README.md package.json package-lock.json tsconfig.json vite.config.ts \
  index.html client public server shared deploy tools test docs/release-prep/2026-10-02
shasum -a 256 "$OPUS_EVIDENCE/source.tar.gz" > "$OPUS_EVIDENCE/source.tar.gz.sha256"
```

The allowlisted archives exclude live `data/`, credentials, browser profiles and `node_modules/`. The release payload intentionally contains built client assets, not raw `client/`; a PNG left only in the source directory is not delivered. Keep evidence and temporary data until reviewed; do not add a cleanup/deletion step without authorization.

## 2. Production-CSP local acceptance with isolated data

- [ ] Root assigns unused loopback ports before starting anything. Do not reuse another worker's browser or server. Every runtime uses a new temporary `DATA_DIR`; never point these commands at project `data/` or `/var/lib/game-opus`.
- [ ] Test the built client in production mode, with the service's actual feature flags: `FORTRESS=1 FIGHT=1 FISH2=1`, without `--dev`. `DEV_WEATHER` and `DEV_RIG` are development-only and do not exercise production behavior.

Example preparation in the Node 24 shell; start each long-running command in its own controlled terminal/session, using the same assigned port values:

```sh
OPUS_QA_DATA=$(mktemp -d "${TMPDIR:-/tmp}/opus-release-runtime.XXXXXX")
chmod 700 "$OPUS_QA_DATA"
OPUS_GAME_PORT=5197
OPUS_PROXY_PORT=5198
OPUS_CDP_PORT=9337
command -v lsof >/dev/null
if lsof -nP -iTCP:$OPUS_GAME_PORT -iTCP:$OPUS_PROXY_PORT -iTCP:$OPUS_CDP_PORT -sTCP:LISTEN; then
  echo 'QA port occupied: root must assign another free port' >&2
  exit 1
fi
HOST=127.0.0.1 PORT="$OPUS_GAME_PORT" DATA_DIR="$OPUS_QA_DATA" \
  ALLOWED_ORIGINS="http://localhost:$OPUS_PROXY_PORT" \
  FORTRESS=1 FIGHT=1 FISH2=1 NODE_ENV=production node server/main.ts
```

```sh
TARGET_PORT=5197 PROXY_PORT=5198 node tools/release/csp-proxy.mjs
```

Open `http://localhost:5198/` for human gameplay and `http://localhost:5198/?debug` only for local diagnostics. Check the health route and actual response CSP before accepting browser evidence:

```sh
curl --fail --silent --show-error http://localhost:5198/health
curl --fail --silent --show-error -I http://localhost:5198/
```

The proxy's policy matches the checked-in nginx policy: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' wss://game.tired.solutions; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` ([csp-proxy.mjs](../../../tools/release/csp-proxy.mjs), [game.nginx.conf](../../../deploy/game.nginx.conf)). This does not prove that production currently serves that configuration. Local acceptance must keep all actual HTTP/WebSocket requests on loopback; the allowed production WebSocket URL in the policy is not permission to connect to production.

The desktop CSP acceptance command requires an isolated Chrome/CDP instance:

```sh
OPUS_CHROME_DATA=$(mktemp -d "${TMPDIR:-/tmp}/opus-release-chrome.XXXXXX")
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9337 \
  --user-data-dir="$OPUS_CHROME_DATA" --ignore-gpu-blocklist
```

```sh
EXPECT_FORTRESS=1 EXPECT_FIGHT=1 EXPECT_FISH2=1 \
  CDP_PORT=9337 URL='http://localhost:5198/?debug' \
  OUT="$OPUS_EVIDENCE/csp" node tools/release/csp-check.mjs
```

**The runner now fails acceptance on recorded errors.** It requires explicit `EXPECT_FORTRESS`, `EXPECT_FIGHT` and `EXPECT_FISH2` values of `0` or `1`; missing/invalid expectations fail. CSP violations, browser errors/relevant warnings, missing built content/canvas/coin images, failed desktop lobby join and mismatched flags return nonzero. It writes `OUT/result.json` and a desktop `lobby.jpg`; without `OUT` it creates a temporary evidence directory. A normal audio warning that awaits a user gesture is ignored; AudioContext errors still fail. This narrow lobby gate does not replace gameplay checks across the matrix. Phone emulation is no longer part of this command; the separate short mobile compatibility check remains below.

- [ ] No CSP violations, runtime exceptions, unexplained warnings, failed assets or unintended external requests throughout the desktop matrix, not only on initial lobby load.
- [ ] Rod images, statue/model textures, coin icons and Cyrillic/Latin Rubik text render under CSP. No new image/loader depends on forbidden `blob:` URLs, inline executable scripts or a remote CDN.
- [ ] A separate flags-off compatibility check confirms hidden entry points and old fallback behavior remain functional where required; do not mistake it for the production-flags run.
- [ ] Root records browser/version, machine, GPU, actual CSS viewport, settings, logs and screenshots. Headless/emulated screenshots supplement visible desktop play.

## 3. Bundled assets and dependency boundary

- [ ] The three generated source assets exist: `client/assets/rods/advanced.png`, `professional.png`, `master.png` (inspection: each is 1254×1254 RGBA PNG). Preserve [PROVENANCE.md](../../../client/assets/rods/PROVENANCE.md).
- [ ] Record the actual generation backend for the current asset work: **built-in ImageGen fallback; `codex_cli` unavailable**. Do not label these assets as generated through `codex_cli`. Generation, final file presence and integration are separate acceptance steps.
- [ ] Final UI references all three through Vite imports/URL handling or another verified local bundling path. Verify each resulting `dist/` image and its successful local response, then see the correct rod in the NPC modal/profile. Existence in `client/assets/` does not prove bundling.
- [ ] All required models, textures, fonts and UI images are included in the release archive. Vite copies `public/` and emits imported assets to `dist/`; Rubik is imported from local `@fontsource/rubik` ([vite.config.ts](../../../vite.config.ts), [client/main.ts](../../../client/main.ts)). Preserve the existing statue/memorial assets.
- [ ] Browser network evidence confirms the upgrade has no new external runtime dependency. Installing locked npm packages and obtaining the server's Node runtime are existing release-install dependencies; they are distinct from a browser needing a remote asset to play.
- [ ] Check the archive file list and extracted file hashes in a temporary directory. Do not inspect, package or publish persistent player data or tokens with evidence.

## 4. Protocol 8 and profile migration acceptance

The preserved release-6 baseline declares protocol **7**; the current shared constant declares **8**. The hub rejects an incorrect version with an error and WebSocket close **4002** ([shared/constants.ts](../../../shared/constants.ts), [server/hub.ts](../../../server/hub.ts)). Treat this as an intentional client/server compatibility boundary.

| Required test/rehearsal | Acceptance |
|---|---|
| Protocol 8 fresh client | Hello, profile, scene and binary snapshots work in lobby, Fight and Fortress; new snapshot fields decode without truncation/NaN and preserve server/client determinism |
| Cached protocol 7 tab | Reconnect after switching candidate gets a clear version/update path and loads the new build; it does not parse v8 snapshots as v7 or loop forever at join |
| Candidate tab after code rollback | Detects old build/version and returns to the appropriate client; rehearse against the preserved local baseline only |
| Old synthetic profile without `fishing` | Safe zero progress defaults; preserve ID/device hashes, nick, tokens, owned/outfit, album, statistics and daily-bonus state |
| Old 30-species album → 32-species upgrade | Preserve existing entries and earned wardrobe items; both appended species can be caught/stored, and new collection completion/reward requires 32 qualifying species rather than 30 |
| Bad/partial fishing values | Finite, nonnegative integer counters; valid earned rod only; safe expired buff/max-level behavior; normalization does not mutate the input fixture |
| Forward save → restart/reconnect | XP, catches/quests, selected rod, buff wall-clock expiry, expanded stats, album and podium survive; no duplicate purchase/quest/discovery credit |
| Daily rollover | Moscow-day podium reset is deterministic with stable catch tie order; four existing leaderboard categories continue updating |
| Candidate save → release-6 load/save → candidate load | Determine exactly which new fields old code drops and the product impact before accepting a code-only rollback |

- [ ] Use generated synthetic saves and fixed clocks in temporary directories, never a copy of production profiles. Cover first-time, partial old and malformed profiles plus a full upgrade/restart/rollback/re-upgrade cycle. Inspect focused tests such as `store.test.ts`, `profiles.test.ts`, `hub.test.ts`, `conn.test.ts`, `fishprogress.test.ts` and the final server/protocol migration tests, then run the complete suite after integration.
- [ ] `me`, `fishProgress`, `fishNpc`, event and hook/rejoin messages agree with the final shared types and root app state; cast modifiers are snapshotted at cast start and replay/rewards remain deterministic if a buff expires mid-cast.
- [ ] Existing six fishing coordinates/spot IDs and all previous interaction IDs are preserved; six new spots/interactions are appended. Compatibility tests pin this against the baseline.
- [ ] Explicitly record backward-migration limits. Release-6 normalizes a whitelist of known profile/state fields: after an old-code load/save, new fishing progress/statistics/podium can be discarded even though `DATA_DIR` was not replaced. Automatic symlink rollback alone does not establish data safety.

## 5. Desktop QA matrix

Record each row as **not run / pass / fail / limited**, with the actual route/fixture, settings, browser, evidence path and remaining issue. A controlled fixture demonstrates a specific state; label it separately from completing the full game flow. Use ordinary keyboard/mouse play for the primary acceptance.

Latest approved fishing addendum: **32 collection fish**, with exactly two appended species IDs **34/35**: `bluemarlin` (Legend) and `greenlandshark` (Myth), both event-only. Existing common `picarel` becomes event-only, completing all five unique event rarity tiers. Base event multiplier remains **×1.5**; verify the requested stronger event profit through final simulations and clear UI wording. This supersedes historical 30-species acceptance text.

| Area | Desktop acceptance |
|---|---|
| Fight first person | Active fighter camera follows current yaw/pitch and predicted movement immediately; own body stays out of view, opponents remain visible at contact distance. Hands leave a clear centre, attacks/blocks/grabs/throws read clearly and align with server impact. Check round start, knockout/respawn, spectators/results, Esc/modal close and pointer recovery |
| Quality and FPS | Change auto/low/medium/high in every active scene (lobby, Fight, Fortress, paintball, race); presets update live and manual choice persists. Record frame/FPS median and p95, full-frame render calls/triangles, GPU/CPU evidence and memory on the actual test machine. Test rain, crowds, 12 fishing players and a busy fortress wave. Auto quality stabilizes without oscillation; enemy warnings, hit rules, rewards and simulation do not change with graphics |
| Fortress shop | Reach shop during preparation/break; read balance, prices/effects and availability; buy magazine/anti-air plus existing repairs/jam/turrets. Insufficient balance, repeat/owned upgrades, wrong phase and out-of-range requests do not spend. Closing restores movement/pointer. Expanded 42-round magazine survives manual/auto reload and prediction |
| Fortress flyers | First appear on wave 4. Visible height, fixed-target warning, dive and recovery agree with snapshots; dodge works, crystal target works without wall defenders, damage does not pass through wall/roof cover. Anti-air upgrade is legible and effective |
| Fortress boss | Full playable progression reaches wave 8. One substantial boss has a name/health bar, three phases, clear attack telegraphs, armour/vulnerable windows and limited reinforcements. Verify fair 1- and 6-defender scenarios, no more than 60 live enemies, no early win while boss or remaining wave is alive, loss/rejoin/result behavior. Preserve separate fixture evidence for phase/cover checks |
| Fishing NPC and movement | Fisherman at agreed former-board location; deck/approach is reachable. Proximity and server eligibility enforced; modal opens/closes without trapped input. Board/podium readable at new locations; memorial, photo and lighthouse passage remain usable |
| Beer/rain buffs | Beer costs 15, lasts 10 minutes, has visible timer/animation/sound and exactly +10% fish-sale effect with intended rare weighting. Reject active rebuy without spending; no treasure/quest/discovery/other-game bonus. Rain drum costs 500, uses the same event path, rejects during rain without spending; normal/forced duration and end agree, and all rooms receive notification. All five event-only tiers are available during the event only; unique-event reward base is ×1.5 with its scope explicit |
| XP and quests | Only landed qualifying fish increment progress; ten levels, max-level display safe, +2.5% zone per level only. Requirements 5/10/15/...; claim pays current N×5 once, carries surplus catches and cannot double-credit across reconnect. No quest credit for escapes/boots/treasure |
| Rods | Unlock after quests 1/5/10; choose one earned rod; distinct generated image for each. 10/20/30% bonuses do not stack, selection and buffs survive reconnect/restart and match cast-time replay modifiers |
| Album and boards | All 32 species fit, including appended IDs 34/35; records/counts/stats are correct, new entries/rewards persist and collection completion/reward requires 32. Preserve earlier earned items. Four leaderboards update; top three are individual catches, allowing one player's multiple catches, with stable ties and Moscow rollover |
| Fishing balance | Retain reproducible original/final simulations for clear/rain, typical/expert and rarity/difficulty. Common prices are +75% from original integer-rounded prices; base fish-only typical income targets approximately +50% from the measured 13.465547 baseline (~20.198321 tokens/min). Measure final stronger event profit with 32 species and event-only picarel; base event multiplier remains ×1.5. Report actual final rates; list treasure, quest and discovery income separately. Do not use the attachment's unverified 25–30 baseline |
| Exactly 12 spots | Old six plus two pier/four lighthouse spots: for **each** walk→use→cast→hook→reel→catch→exit. Inspect all six additions physically and prove 12 simultaneous occupants, independent ownership/rewards, occupancy/reconnect/cleanup and unobstructed NPC/photo/board/podium/boat access |
| Regression and mobile minimum | Desktop login/reconnect, profile/wardrobe/tokens, basic lobby, paintball/race and existing interactions remain usable. Short mobile/emulation check: load/join, walk, primary UI/NPC/album close, enter a mode and no critical layout/input failure; report exact coverage and whether any real device was used |

## 6. Existing deployment steps — only after explicit authorization

Source inspection of [deploy.sh](../../../deploy.sh), [install.sh](../../../deploy/install.sh), [service](../../../deploy/game-opus.service) and [smoke.ts](../../../deploy/smoke.ts) establishes this sequence; no real deployment step was run by this worker. The command was exercised only in a synthetic directory with external boundaries mocked:

1. Re-run typecheck/tests/build/compression locally. `./deploy.sh` then fetches production `/health`, packages `package.json package-lock.json server shared dist deploy`, uploads through the existing SSH connector and runs the installer. Do **not** use it as a local gate: it performs external writes.
2. The guard now fails closed on failed/unreachable/timed-out requests, HTTP errors, malformed JSON, `ok !== true`, and missing/invalid counters. It allows a nonnegative safe integer `busy` (or legacy `humans` only when `busy` is absent); a positive count still stops deployment. Fresh healthy **`busy=0`** includes Fight/Fortress. `FORCE=1` retains the explicit bypass and requires approval to interrupt active play; the health request has a five-second timeout.
3. Install into `/opt/game-opus/releases/<UTC-ID>`; use the separate runtime `/opt/game-opus/runtime`. It names Node v24.15.0, but downloads/copies it only if the runtime executable is absent: verify the actually selected major version in the approved production preflight.
4. Run `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`; set release ownership/permissions; install the systemd unit; atomically switch `current`; daemon-reload, enable and restart `game-opus`. Service flags are `FORTRESS=1 FIGHT=1 FISH2=1`, port 5190, persistent data `/var/lib/game-opus`.
5. Up to ten attempts: local HTTP health plus authenticated WebSocket smoke waits for `me`, `scene`, and a binary world snapshot. It uses the on-server smoke credential internally; never print it or include it in screenshots/logs. This proves lobby connectivity, not the new game mechanics.
6. On failure, installer returns the old symlink/restarts (or stops on first installation). It does **not** restore the previous service unit or data, nor independently assert that rollback is healthy. On success it keeps five release directories; retain the chosen rollback candidate independently before pruning.
7. Nginx is not changed by this installer. Inspect the approved production configuration/headers when that stage is authorized; any needed nginx update is a separate production change with configuration test and rollback.

## 7. Backup and rollback runbook — prepared commands, never run here

Local source/build archives above are safe preparation. The following are **Linux server commands for an explicitly approved operator session**, not commands to execute during local development. They contain no credential values. A brief stop interrupts active games: agree the maintenance window and preserve progress by graceful shutdown before archiving. Production archives contain private player state/credentials; keep them root-only on the server, do not attach them to reports.

### Before an approved deployment

```sh
set -eu
umask 077
OPUS_SAVE_ID=$(date -u '+%Y%m%d-%H%M%S')
OPUS_SAVE=/var/backups/game-opus/$OPUS_SAVE_ID
mkdir -p "$OPUS_SAVE"
OPUS_OLD_RELEASE=$(readlink -f /opt/game-opus/current)
test -d "$OPUS_OLD_RELEASE"
printf '%s\n' "$OPUS_OLD_RELEASE" > "$OPUS_SAVE/current-path"
cp -p /etc/systemd/system/game-opus.service "$OPUS_SAVE/game-opus.service"
tar -czf "$OPUS_SAVE/release.tar.gz" -C "$OPUS_OLD_RELEASE" .
systemctl is-active --quiet game-opus
systemctl stop game-opus
trap 'systemctl start game-opus' EXIT
tar -czf "$OPUS_SAVE/data.tar.gz" -C /var/lib/game-opus .
gzip -t "$OPUS_SAVE/release.tar.gz" "$OPUS_SAVE/data.tar.gz"
sha256sum "$OPUS_SAVE/release.tar.gz" "$OPUS_SAVE/data.tar.gz" > "$OPUS_SAVE/SHA256SUMS"
systemctl start game-opus
trap - EXIT
curl --fail --silent --max-time 2 http://127.0.0.1:5190/health
```

Record the backup directory, current release path, archive integrity and service recovery; do not print archived contents. Backups made after a candidate first loaded/saved are not a substitute for a pre-migration snapshot.

### Code/unit rollback

First rehearse backward migration locally. After explicit rollback authorization, choose the recorded backup; do not guess a release directory. If the old target was pruned, recover its preserved release archive into a new readable directory under `/opt/game-opus/releases/` before switching; do not point the service inside root-only `/var/backups/`.

```sh
set -eu
OPUS_SAVE=/var/backups/game-opus/REPLACE_WITH_APPROVED_BACKUP_ID
OPUS_ROLLBACK_RELEASE=$(cat "$OPUS_SAVE/current-path")
test -d "$OPUS_ROLLBACK_RELEASE"
systemctl stop game-opus
install -m 644 "$OPUS_SAVE/game-opus.service" /etc/systemd/system/game-opus.service
ln -sfn "$OPUS_ROLLBACK_RELEASE" /opt/game-opus/current.rollback
mv -T /opt/game-opus/current.rollback /opt/game-opus/current
systemctl daemon-reload
systemctl start game-opus
curl --fail --silent --max-time 2 http://127.0.0.1:5190/health
```

Then run the approved credential-aware smoke without displaying credentials and verify the public browser/reconnect path plus essential modes. A healthy HTTP endpoint alone is insufficient. Do not call this rollback data-preserving unless the synthetic migration rehearsal proves it.

### Data rollback requires a separate explicit decision

Restoring `data.tar.gz` rewinds tokens, rewards and activity after the snapshot. If required by the migration rehearsal, agree that loss before the candidate is deployed. With the service stopped, preserve the current data directory intact and restore the approved archive into a new directory; do not overwrite the only current state:

```sh
set -eu
umask 077
OPUS_SAVE=/var/backups/game-opus/REPLACE_WITH_APPROVED_BACKUP_ID
OPUS_RESTORE_ID=$(date -u '+%Y%m%d-%H%M%S')
OPUS_RESTORE=/var/lib/game-opus.restore-$OPUS_RESTORE_ID
test ! -e "$OPUS_RESTORE"
gzip -t "$OPUS_SAVE/data.tar.gz"
systemctl stop game-opus
mkdir -m 700 "$OPUS_RESTORE"
tar -xzf "$OPUS_SAVE/data.tar.gz" -C "$OPUS_RESTORE"
chown -R game-opus:game-opus "$OPUS_RESTORE"
mv /var/lib/game-opus "/var/lib/game-opus.before-restore-$OPUS_RESTORE_ID"
mv "$OPUS_RESTORE" /var/lib/game-opus
systemctl start game-opus
curl --fail --silent --max-time 2 http://127.0.0.1:5190/health
```

Pair this with the chosen compatible code/unit rollback; validate smoke, identity, balances and essential gameplay without exposing profile contents. Retain the displaced directory for recovery. Do not restore data automatically on every failed deployment.

## 8. Open acceptance blockers for root

- [ ] Final integrated source, worker reports and fresh complete gates are pending. No readiness claim can be inferred from this checklist.
- [ ] Root must supply final desktop/CSP/runtime evidence across the matrix; the improved CSP runner enforces the primary lobby gate, while the gameplay matrix remains required.
- [ ] Root must verify final server/profile/protocol migration integration and backward-save effects. During this inspection the shared API/rules existed while server persistence was still being edited; partial-state observations are not final findings.
- [ ] Root must prove rod image bundling, NPC/album integration, all six new physical spot cycles and 12-player concurrency; source images alone are insufficient.
- [ ] Agree a compatible backup/rollback policy including service-unit restoration and any lost new progress; installer rollback currently handles code symlink only.
- [ ] Finish final README behavior/flag documentation; its historical description of disabled production modes conflicts with the current checked-in service. Record actual final balance results and remaining manual/device coverage.
- [ ] Human acceptance and explicit production deployment authorization remain outstanding. Production runtime/configuration/health, backup existence and release success were not inspected.

**Handoff:** runbook examples are prepared, not executed. Only the focused mocked release-safety checks below ran; complete game gates and runtime QA remain pending until root attaches fresh evidence for the final candidate. Deployment is a separate action.

## 9. Local release-safety fixes and focused verification

Changes are documented in [REPORT-release-safety.md](./REPORT-release-safety.md): `tools/release/csp-check.mjs`, `deploy.sh`, two focused command tests and one test-only external-boundary fixture. The fixture opens no socket and never invokes SSH; the real CSP command and copied real shell script execute against controlled browser/CDP and fetch/process boundaries.

Fresh results: **36/36 focused tests pass** on Node v24.15.0. Before implementation, the original commands produced **28 failures / 6 passes**, demonstrating false-success cases while preserving idle/busy/FORCE behavior. A later recorded-browser-error regression was separately reproduced and fixed. Logs remain outside the source tree at `/tmp/opus-release-safety-red.log`, `/tmp/opus-release-safety-late-red.log` and `/tmp/opus-release-safety-green.log`.

```sh
/opt/homebrew/opt/node@24/bin/node --test test/release-csp.test.ts test/release-deploy.test.ts
/bin/sh -n deploy.sh
/opt/homebrew/opt/node@24/bin/node --check tools/release/csp-check.mjs
/opt/homebrew/opt/node@24/bin/node --check test/release-fixture.mjs
/opt/homebrew/opt/node@24/bin/node node_modules/typescript/bin/tsc \
  --ignoreConfig --noEmit --strict --skipLibCheck --target ES2023 \
  --module ESNext --moduleResolution bundler --allowImportingTsExtensions \
  --verbatimModuleSyntax --types node test/release-csp.test.ts test/release-deploy.test.ts
```

The focused typecheck and syntax checks pass. Complete project gates, actual Chrome/CSP/gameplay acceptance and all production checks were deliberately not run by this worker while other areas are changing. The installer was not modified: rollback still restores only the code symlink, not the prior unit or data, and old-code save can discard new progress. The approved backup/migration rehearsal and explicit deployment/data-restore decisions above remain required.

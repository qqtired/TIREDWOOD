# Local release-safety fixes

Status: two local guard fixes implemented and checked with mocked external boundaries. This is not integrated-game, browser or production acceptance. The workspace is non-Git; `git status --short` returns exit 128. Existing sources were preserved for review at `/tmp/opus-release-deploy-before.sh` and `/tmp/opus-release-csp-before.mjs`. No deploy, SSH, real production request, persistent player-data access, commit or push occurred.

## Changes

- `deploy.sh`: remove failed-fetch → zero fallback. Require a successful HTTP response, valid JSON object with `ok === true`, and a nonnegative safe integer `busy`; use legacy `humans` only if `busy` is absent. Abort on unknown/invalid health with an explicit error, bound the request to five seconds. Keep the positive-busy stop and exact `FORCE=1` bypass; valid idle still reaches packaging/upload/install in the same order.
- `tools/release/csp-check.mjs`: require explicit `EXPECT_FORTRESS`, `EXPECT_FIGHT`, `EXPECT_FISH2` values of `0`/`1`. Return nonzero for CSP violations, browser exceptions/errors/relevant warnings, missing build/canvas/images, failed desktop join/scene and unexpected flags. Collect late errors before the final decision. Ignore informational entries and the specific audio warning awaiting a user gesture; AudioContext errors still fail.
- CSP evidence: `OUT/result.json`, expected/observed flags and failures, plus desktop `OUT/lobby.jpg` when capture is reached. Default output is a fresh OS temporary directory. Desktop only; no phone matrix was added. CDP operations are bounded and the isolated tab is closed after the check.
- `test/release-csp.test.ts`, `test/release-deploy.test.ts`, `test/release-fixture.mjs`: exercise the real commands. Only browser/CDP, fetch, local build commands and SSH/upload/install boundaries are mocked. The fixture never opens a socket; synthetic project packaging is real, and no production connection is possible through the test boundary.
- `RELEASE-CHECKLIST.md`: update current command/guard behavior, verification and unchanged rollback limits; accept the approved 32-species addendum and accurately identify built-in ImageGen fallback (`codex_cli` unavailable).

## Reproduction and fresh results

| Verification | Result | Evidence |
|---|---|---|
| Original command behavior, Node 24 | 34 tests: 6 pass, 28 fail as expected | `/tmp/opus-release-safety-red.log` |
| Late recorded browser-error regression | Returned zero with an error recorded; failing test reproduced before its fix | `/tmp/opus-release-safety-late-red.log` |
| Final focused command tests | **36/36 pass**, exit 0 | `/tmp/opus-release-safety-green.log` |
| Shell and module syntax | `sh -n deploy.sh`; `node --check` CSP runner and fixture pass | Commands below |
| Focused TypeScript check | Both new test files pass, exit 0 | `tsc --ignoreConfig ...` below |

Run from `/Users/tired/Desktop/tired.solutions/game-opus`:

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

After root starts its separately approved isolated Chrome/proxy/game server, production-enabled desktop CSP acceptance uses:

```sh
EXPECT_FORTRESS=1 EXPECT_FIGHT=1 EXPECT_FISH2=1 \
  CDP_PORT=9337 URL='http://localhost:5198/?debug' \
  OUT="$OPUS_EVIDENCE/csp" node tools/release/csp-check.mjs
```

Choose free assigned ports and a temporary `DATA_DIR` as described in the checklist. Use explicit zero expectations for a separate disabled-flags run. This worker did not run the actual browser command.

## Remaining acceptance and rollback limits

Complete project typecheck/tests/build/compression were not run during active parallel edits; root must run them on the final integrated source. Mocked CDP verifies the command's acceptance decisions, not real WebGL rendering, gameplay, frame performance or final rod/fish asset bundling. The full desktop matrix and short mobile compatibility check remain root work.

`deploy/install.sh`, systemd/production configuration and profile migrations were not changed. Installer failure rollback still restores the old `current` symlink only, leaves the newly installed unit/data in place, and does not prove rollback health. Older code can discard newly introduced profile/podium fields on save; restoring a pre-migration data archive also rewinds intervening rewards. Retain a compatible release/unit/data snapshot, rehearse synthetic forward/backward migration and obtain explicit deployment/data-restore approval before using the runbook. No deployment-readiness claim is made here.

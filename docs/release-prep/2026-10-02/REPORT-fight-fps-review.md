# Independent Fight Club and common FPS review

Result: no actionable regression found in the reviewed changes. This is a bounded source review with scoped tests, not final desktop visual acceptance or release approval.

Compared the current scoped files with `backups/release-6-source-baseline/game-opus`; both trees are non-Git. Read the current desktop-primary `AGENTS.md`, upgrade Tasks 1/4 and integration contracts. No implementation, browser/server, production/data, commit or deployment changes were made; this report is the only project edit.

Inspected:

- `client/fight/*`: first-person yaw/pitch and prediction offsets, authoritative reset orientation, action/contact tick alignment, immediate local windup versus server impact feedback, close-opponent visibility, KO/crowd/results transitions and disposal of the new fists. Relevant paths: `match.ts:417–434`, `650–667`, `739–791`, `817–964`; `presentation.ts:7–26`; `hands.ts:89–121`; `fists.ts:51–92`.
- Fight quality: scene wiring, render-target/MSAA recreation, world/fists/grade pass order, crowd counts and update cadence, dust/light budgets. Relevant paths: `scene.ts:37–42`, `grade.ts:101–148`, `crowd.ts:168–185,214–280`, `arena.ts:344–398`. Checked installed Three render-target deallocation/setup rather than assuming that disposing a target makes it permanently unusable.
- Common quality/stats lifecycle: `client/app.ts:657–695,1048–1133`, `client/render/renderer.ts:35–82,97–107`, `client/render/quality.ts`; lobby live effect budgets and distant decorative fishermen; paintball scene/shadow preset updates. Checked paused/hidden frame handling, all-pass statistics reset, bounded asynchronous GPU queries and context-loss invalidation.

Fresh verification:

- `/opt/homebrew/bin/node --test test/fight.test.ts test/fight-game.test.ts test/fight-view.test.ts test/fight-flag.test.ts test/quality.test.ts`: **46 passed, 0 failed**, exit 0. Full output: `/tmp/opus-fight-fps-review-tests.log`.
- A temporary in-memory probe of the actual `Renderer` methods passed three-pass aggregation, one sample per 30 measured frames, unavailable-result polling, disjoint-result discard, lost-context and missing-extension guards. Its GL context was fake; it does not prove driver behavior or real restoration.

Remaining root checks: integrated check/test/build gate; final desktop punches/contact readability, camera/round/KO/results transitions and live preset changes in the real browser. Actual GPU query/restore behavior and a physical mobile device were not tested here. No full suite/typecheck was run while other workers were editing. In-progress fishing/fortress changes were outside this review.

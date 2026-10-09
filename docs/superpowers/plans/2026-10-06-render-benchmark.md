# TIREDWOOD renderer comparison — experimental local stand

**Goal:** compare the same deterministic representative harbour scene with A: current WebGLRenderer, B: WebGPURenderer forced to WebGL 2, C: actual WebGPU, and produce a source-backed report with raw measurements and screenshots.

**Approved design:** the A/B/C experiment described in this chat and accepted by Roman on 6 October 2026. This is a local research prototype; it does not migrate the game. Workers use GPT-6.1 as requested.

## Constraints and decisions

- Work in the existing clean game-opus checkout with disjoint file ownership. No commits, push, deployment, production game access, secrets, chatgame or statue changes.
- No gameplay imports or production entry points are changed. Stand lives in tools/render-bench, has a separate Vite configuration/output, and remains outside the game build.
- Same scene data, geometry, deterministic motion, camera, dimensions/DPR and quality. A uses classic materials; B/C use the same node-material graph. Record material/lighting differences rather than hiding them.
- Representative procedural harbour slice: quay, sea, trees/buildings, jelly-like characters, shadows, deterministic rain. It is not a literal production-level benchmark and does not establish multiplayer capacity.
- B must actually use WebGL; C must actually use WebGPU. Unavailable hardware is a reported unsupported result, never silently measured fallback.
- Measure normal frame interval, JS update/render submission time and optional asynchronous GPU timestamps. Missing GPU data is null, never zero. No inspector during performance runs.
- Warm-up and steady state are separate. Scene construction/init/compile times are labelled as scene setup, not an uncached browser/driver start.
- Default desktop canvas 1280×720, DPR 1. Three rotated orders, 3 s warm-up + 10 s measurement, scenarios 16 characters/dry and 64 characters/rain. Record environment, visibility changes, raw samples, errors.
- Check frozen t=2 s screenshots of all three variants. Capture Spector separately for A/B if available. C uses native GPU timing.
- Tests for percentile math, absent/invalid samples, rotated order, backend verification and scene parity. Full project check/test/build once at end plus stand check/build, desktop interactions, compact mobile layout smoke.
- Artifacts/report outside the game repository, in /Users/tired/Desktop/tired.solutions/render-benchmark-2026-10-06. Preserve original user changes in parent repository.

## File ownership / tasks

1. **Scene worker:** tools/render-bench/scene.ts, scene-data.ts, materials.ts, test/render-bench-scene.test.ts. Export createBenchScene(config, flavor) with scene/camera/tick/dispose/manifest contract in tools/render-bench/types.ts. Share descriptors and identical formulas between GLSL and TSL. Independently test deterministic geometry/manifests and different workloads. Report to the artifact directory.
2. **Metrics worker:** tools/render-bench/metrics.ts, test/render-bench-metrics.test.ts. Export summarize, summarizeSamples, rotatedOrder, validateBackend. Test real calculations and rejection of WebGPU fallback/invalid frame data. No browser or timing side effects.
3. **Controller:** types.ts; standalone HTML/CSS, main UI, renderer adapters, runtime and timings, separate Vite/TS configs and npm scripts. Browser testing, actual sequential benchmark and captures, evidence report and docs map.
4. **Independent GPT-6.1 review:** scene parity, measurement validity, backend/fallback handling, disposal/cancellation, actual result interpretation. Fix material issues and recheck the affected surface.

## Review focus / done criteria

- Mislabelled backend, GPU zero-as-unavailable, frame units or quantiles must be caught by tests and visible JSON.
- Layout/material discrepancies must be explicit in report; compare same geometries at same frozen time.
- Hidden tabs, resize during run, context/device loss and inspector contamination invalidate a run.
- Avoid GPU readback waits in measured CPU submission. GPU-instrumented and clean runs must be distinguishable.
- Raw results, source version, configs, system/browser details, screenshots, verification logs and reproducible commands accompany the final recommendation.

## Progress

- Initial repository: clean game-opus main at 8146e57. Parent repository has existing unrelated modifications.
- Completed locally on 6 October 2026 with GPT-6.1 scene, metrics, runtime and independent review workers. No commits or deployment.
- Final measured source fingerprint: `0e7769553e182a49e7b1cba84e8a9c81d48e12997958d8c06f4ec916f9a71ab1`. Source and measurements remain experimental.
- Checks: project check, 1521 tests (17 added), game build, bench check/build passed. Existing game chunk-size warning remains.
- 26 recorded runs: 25 valid, one resized-window run retained as invalid; its replacement restored three clean runs per scenario/variant. Raw summaries independently recalculated without discrepancies. GPU profiles and Spector captures are separate from clean timing.
- Artifacts: `/Users/tired/Desktop/tired.solutions/render-benchmark-2026-10-06/report.html`, raw JSON, six frozen PNGs, independent summaries and Spector archives. One M1 Pro / Chromium154 device only; no full-game or production/multiplayer performance claim.

## Follow-up requested by Roman: order-of-magnitude workload

- Added 1×/10× selector; original 1× geometry/signatures remain unchanged. Heavy presets: 160/dry and 640/rain characters, 100 buildings, 240 trees, 18000 rain drops and 10× water triangles. Materials, renderers, timing logic and image quality settings unchanged.
- New source fingerprint: `5ebd7ecfa5779447de632d487c2fe5d2a5500a096adc38aaad539705cba0840d`. Original source preserved under the first report's `source-v2/` directory.
- All 24 new runs valid (18 clean + 6 GPU profiles), independently recalculated. Actual draws 1108/1109 for 160 and 3510/3511 for 640; triangle work close to 10×. All 1524 tests, type checks and both builds passed.
- Separate follow-up report: `/Users/tired/Desktop/tired.solutions/render-benchmark-10x-2026-10-06/report.html`. First report and raw data remain intact. No new Spector capture was needed; timed GPU profiles are separate from clean measurements.

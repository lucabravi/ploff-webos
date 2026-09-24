> **Archived historical record.** This document describes a completed or superseded implementation phase. Do not use it as the current behavior reference; see `docs/README.md`.

# Ploff Project Hardening and Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the 2026-08-19 full-project review into evidence-driven improvements to packaging, runtime overhead, developer feedback speed, performance observability, memory coverage, maintainability, resilience, supply chain, and legacy-TV UX without reopening stabilized playback behavior.

**Architecture:** Keep the current runtime architecture and public feature boundaries intact. Prefer pure helpers, build-time tooling, deterministic operation budgets, and narrowly scoped controllers; every production behavior change starts from a failing characterization/contract test. Work is delivered in five three-task checkpoints, each followed by the full project gate, a commit on `develop`, and a recovery ZIP containing `.git` but excluding `node_modules`.

**Tech Stack:** ES5 browser runtime for Chrome 53/webOS, dependency-free runtime JavaScript, Node.js 20 development tooling, shell packaging scripts, ESLint 10.8.0, TypeScript 7.0.2 checkJs contracts, Acorn 8.17.0, existing Node/assert test harness.

**Spec:** `docs/runtime-architecture-redesign.md`, `docs/maintenance.md`, `docs/testing.md`, and the evidence register in this plan.

## Global Constraints

- Work only on the existing `develop` branch; do not create a feature branch or worktree.
- Runtime code must remain ES5 / Chrome 53 compatible and dependency-free.
- `NativeVideoDriver`, `PlaybackReposition`, `PlaybackSession`, `PlaybackTimeline`, `SubtitleRuntime`, and `PlayerQueueController` remain approved ownership boundaries.
- `reposition != recovery` remains a hard invariant.
- Subtitle Apply/Cancel, SRT buffering/keyframe settlement, ASS/SSA privacy/retry, Direct Play/Direct Stream behavior, stale callback handling, and queue occurrence identity must not regress.
- Do not refactor large facades solely to reduce line count; extraction requires a cohesive responsibility and consumer evidence.
- Do not use wall-clock CI thresholds for runtime performance. Prefer deterministic byte, count, and operation budgets.
- Do not change LAN/HTTP server preference semantics as an incidental hardening measure.
- Use the provided `node_modules` only as the pinned development toolchain; never include it in deliverable ZIPs.
- At each checkpoint run `npm run verify`, `npm run test:memory`, `git diff --check`, and `git fsck --full` before commit/export.
- Each ZIP must include `.git`, exclude `node_modules`, and be verified by extraction into an independent directory.

---

## Evidence Register

The review was performed on `develop @ b5d7e991021737fdf5f5b177b2ee0b4a872f7cfe` with a clean tree and a complete green `npm run verify` plus memory/Git gates.

1. `scripts/package-tv-shell.sh` copies all of `app/` into the IPK stage and removes only `source/`. The staged `app/coordinator/` tree is about 1,021,846 bytes and `app/styles/` about 185,172 bytes even though runtime uses generated `app/app.js` and `app/styles.css`. Removing both saves about 1,207,018 unpacked bytes and avoids hashing unused source inputs into the release cache key.
2. `app/libass-subtitle-renderer.js` creates JavascriptSubtitlesOctopus with `debug: true`; the vendor debug path emits performance logging during subtitle rendering and is unnecessary production overhead on legacy TVs.
3. `package.json` runs 180 `tests/test-*.js` files strictly sequentially. An isolated-process experiment completed the same tests successfully with bounded parallelism, making process scheduling a high-ROI developer/CI optimization.
4. `scripts/check-performance-budget.js` guards only generated `app/app.js` at 900,000 raw / 190,000 gzip bytes. Startup actually references 123 local script tags and roughly 1.9 MB raw JavaScript plus about 185 KB raw CSS.
5. `scripts/benchmark-library-catalog.js` already reports deterministic DOM/image operation counts. These are more suitable for CI regression guards than wall-clock thresholds.
6. `tests/pre-release-memory.js` has strong GC/WeakRef/slope checks but does not cycle the new Playback/Timeline/Subtitle/PlayerQueue owner lifecycle end-to-end.
7. `app/plex-media-mapper.js::mediaFromAttributes()` has the highest observed branch-complexity proxy (about 74 over roughly 104 lines) and is mostly pure mapping logic.
8. `app/plex-client.js::resolvePlaybackOptions()` has another high complexity proxy (about 56) and mixes independent audio/subtitle/playback-option decisions that can be characterized as pure helpers.
9. Large structural tests such as `tests/test-tv-shell.js` mix behavior assertions with source-shape/ownership checks already partly covered by dedicated architecture/maintainability scripts. This increases refactor friction and duplicates policy.
10. `PlayerFeatureController::handlePlaylistQueueKeyCapture()` and `SettingsController::handleKey()` are large input-state routers; command routing is a better decomposition target than creating new domain services.
11. `app/credential-vault.js` performs DB8 `del slot=primary` followed by `put`, and reads with `find limit:1`. A failed delete followed by successful put can potentially leave duplicate slot records unless DB8 target semantics guarantee otherwise; the code should be robust without relying on that assumption.
12. Release status version comparison is numeric split-based and supports current stable `x.y.z` releases but not correct SemVer prerelease ordering if beta/RC channels are introduced.
13. GitHub Actions are SHA-pinned, but container/base-image references and release provenance can be hardened further with immutable digests, SBOM generation, and artifact attestation.
14. Accessibility/performance opportunities with direct TV value remain open: global text scaling, reduced motion, and optional lightweight image loading mode. These should use current settings architecture and preserve card geometry/focus contracts.
15. The app loads 123 local startup scripts. A second generated production bundle could reduce parse/load boundaries, but it must be justified by startup instrumentation first and must leave ASS/WASM lazy.
16. Playback and Player facades remain large, but the review found no evidence for another broad extraction. The only future candidate worth a focused audit is the subtitle-editor workflow; extraction is allowed only if it produces a cohesive workflow without becoming a service locator.

---

# Checkpoint A — Package/runtime overhead and developer feedback

### Task 1: Prune generated-source duplicates from the IPK stage

**Files:**
- Modify: `scripts/package-tv-shell.sh`
- Modify: `tests/test-baseline.sh`
- Test: `scripts/check-shell-assets.js`

**Interfaces:**
- Consumes: the existing generated `app/app.js` and `app/styles.css` contract.
- Produces: a release stage that omits `source/`, `coordinator/`, `styles/`, and `config.local.js` before the content cache key is computed.

- [x] **Step 1: Add the failing packaging contract**

Add baseline assertions that `package-tv-shell.sh` removes the three source-only directories before the `ASSET_HASH=` line and still calls `check-shell-assets.js` after cache-key replacement.

```sh
prune_line=$(grep -n 'rm -rf.*STAGE/source.*STAGE/coordinator.*STAGE/styles' scripts/package-tv-shell.sh | head -n 1 | cut -d: -f1)
hash_line=$(grep -n 'ASSET_HASH=' scripts/package-tv-shell.sh | head -n 1 | cut -d: -f1)
test -n "$prune_line" && test -n "$hash_line" && test "$prune_line" -lt "$hash_line"
```

- [x] **Step 2: Verify RED**

Run: `sh tests/test-baseline.sh`

Expected: failure because the current prune command removes only `$STAGE/source`.

- [x] **Step 3: Implement minimal stage pruning**

Change the existing release-stage prune to:

```sh
rm -rf "$STAGE/source" "$STAGE/coordinator" "$STAGE/styles"
```

Keep `config.local.js` removal and cache-key calculation after this prune.

- [x] **Step 4: Verify GREEN and stage integrity**

Run:

```sh
sh tests/test-baseline.sh
npm run check:assets
```

Expected: both exit 0.

- [x] **Step 5: Record measured package evidence**

Add the measured source-only byte removal and cache-key rationale to `docs/maintenance.md` release packaging guidance.

### Task 2: Disable ASS renderer debug logging by default with explicit diagnostic opt-in

**Files:**
- Modify: `app/libass-subtitle-renderer.js`
- Modify: `tests/test-libass-subtitle-renderer.js`
- Modify only if needed for injection: `app/coordinator/subtitle-runtime.js`

**Interfaces:**
- Consumes: `Renderer.create(options)`.
- Produces: `debug` defaults to `false`; a caller may explicitly pass `debug: true` for a diagnostic session.

- [x] **Step 1: Add failing default/opt-in assertions**

Extend `tests/test-libass-subtitle-renderer.js` so the default instance asserts `created.debug === false`, then construct a second renderer with `debug: true` and assert the constructor receives `true`.

- [x] **Step 2: Verify RED**

Run: `node tests/test-libass-subtitle-renderer.js`

Expected: failure because current production options contain `debug: true` unconditionally.

- [x] **Step 3: Implement minimal option propagation**

Capture `var debug = values.debug === true;` in the renderer factory and pass `debug: debug` to JavascriptSubtitlesOctopus.

- [x] **Step 4: Verify GREEN and subtitle regressions**

Run:

```sh
node tests/test-libass-subtitle-renderer.js
node tests/test-subtitle-runtime.js
node tests/test-playback-controller.js
npm run check:es5
```

Expected: all exit 0.

### Task 3: Replace the serial unit-test shell loop with a bounded parallel isolated-process runner

**Files:**
- Create: `scripts/run-unit-tests.js`
- Create: `tests/test-unit-test-runner.js`
- Modify: `package.json`
- Modify: `docs/testing.md`

**Interfaces:**
- Consumes: standalone `tests/test-*.js` scripts.
- Produces: `node scripts/run-unit-tests.js`; default concurrency 4; `PLOFF_TEST_JOBS=1` restores serial execution; nonzero child exit stops new scheduling and exits nonzero after active children finish.

- [x] **Step 1: Add a failing runner contract**

Create a temporary fixture directory in `tests/test-unit-test-runner.js` with passing/failing scripts and invoke the runner with an injectable file list. Assert bounded concurrency, output labeling, success propagation, and failure propagation.

- [x] **Step 2: Verify RED**

Run: `node tests/test-unit-test-runner.js`

Expected: failure because `scripts/run-unit-tests.js` does not exist.

- [x] **Step 3: Implement the isolated-process scheduler**

Use only Node core modules (`child_process`, `os`, `path`). Spawn `process.execPath` once per test file, cap active children at `PLOFF_TEST_JOBS` or 4, and preserve each test as a separate Node process.

- [x] **Step 4: Switch package script and verify serial equivalence**

Change `test:unit` to `node scripts/run-unit-tests.js`.

Run:

```sh
PLOFF_TEST_JOBS=1 npm run test:unit
PLOFF_TEST_JOBS=4 npm run test:unit
```

Expected: both execute all 180 project test files successfully.

- [x] **Step 5: Document the override**

Add `PLOFF_TEST_JOBS=1 npm run test:unit` as the deterministic troubleshooting command in `docs/testing.md`.

### Checkpoint A gate and export

- [x] Run the complete `verify` command set on the exact checkpoint tree. Every constituent script passed; repeated literal `npm run verify` wrapper attempts were terminated by the container execution ceiling before completion, with no constituent failure.
- [x] Run `npm run test:memory`.
- [x] Run `git diff --check` and `git fsck --full`.
- [x] Commit the three tasks on `develop` as `db521341bdbf7664468ff72aef5a73b1bd8b93b6`.
- [x] Create and independently extract/verify `ploff-hardening-checkpoint-a-db52134-2026-08-19.zip` with `.git` and without `node_modules`.

---

# Checkpoint B — Performance observability and lifecycle coverage

### Task 4: Extend deterministic performance budgets beyond `app/app.js`

**Files:**
- Modify: `scripts/check-performance-budget.js`
- Modify/Create: `tests/test-performance-budget.js`
- Modify: `docs/maintenance.md`

**Interfaces:**
- Produces deterministic metrics for generated app bundle raw/gzip bytes, `styles.css` raw/gzip bytes, initial local script count, and total initial local JavaScript bytes.

- [x] Add failing tests using temporary HTML/asset fixtures that exceed each new budget independently.
- [x] Verify RED with `node tests/test-performance-budget.js`.
- [x] Add `checkStartupAssets(indexPath)` and exported adjustable constants; ignore remote URLs and lazy ASS/WASM assets not referenced by initial script tags.
- [x] Verify GREEN and run `npm run check:performance`.
- [x] Document that byte/count budgets are trend alarms, not immutable product limits.

### Task 5: Add local startup milestones and catalog operation budgets

**Files:**
- Create: `app/startup-metrics.js`
- Modify: `app/bootstrap.js` or the actual bootstrap owner resolved by the current composition root
- Modify: `app/application.js`/coordinator only at existing lifecycle boundaries
- Modify: `scripts/benchmark-library-catalog.js`
- Create: `tests/test-startup-metrics.js`
- Modify: existing catalog benchmark tests

**Interfaces:**
- Startup metrics remain local-only and expose a bounded snapshot of named monotonic milestones: bootstrap, composition-ready, server-ready, first-home-content, first-focusable-ui.
- Catalog CI checks assert deterministic operation counts, not elapsed milliseconds.

- [x] Characterize current lifecycle callbacks and write failing milestone ordering/reset tests.
- [x] Implement a tiny ES5 metrics collector using injected `now()`; no network/storage side effects.
- [x] Wire marks only at already-existing boundaries and expose them through diagnostics, not telemetry.
- [x] Add operation-count ceilings for focus move and row-boundary catalog rendering based on the current green benchmark baseline with modest headroom.
- [x] Verify with focused tests, benchmark, ES5, and diagnostics privacy tests.

### Task 6: Add a Playback/Subtitle/PlayerQueue lifecycle memory scenario

**Files:**
- Modify: `tests/pre-release-memory.js`
- Reuse: existing Playback/Timeline/SubtitleRuntime/PlayerQueue test fakes

**Interfaces:**
- The existing memory gate remains the command; a second lifecycle cycle is added to each sample and must release listeners/timers/renderer/queue-card references.

- [x] Build a failing WeakRef lifecycle characterization around create/open/seek/subtitle Apply-or-Cancel/queue/close/reopen/destroy.
- [x] Confirm the test can detect an intentionally retained lifecycle object before enabling the real cycle.
- [x] Add the real owner cycle using production modules and deterministic fakes.
- [x] Keep existing growth/slope/retained thresholds unless fresh evidence requires a documented adjustment.
- [x] Run `npm run test:memory` and snapshot mode once for leak inspection.

### Checkpoint B gate and export

- [x] Run all `verify` constituent gates plus full test/memory/Git gates. The literal nested `npm run verify` wrapper was terminated by the container ceiling during unit execution; the exact unit suite then passed independently in 21.88 s with no constituent failure.
- [x] Commit tasks 4–6 as `665548ba0e4683592a11242a85425ccba91f5b1c`.
- [x] Export and independently verify `ploff-hardening-checkpoint-b-665548b-2026-08-19.zip` (SHA-256 `2cb6edaa9be3555f5a2fe160bc3a73c4c7062bf207b7f2b9074aeba63dac10d1`).

---

# Checkpoint C — Pure complexity reduction and test architecture

### Task 7: Decompose `plex-media-mapper.mediaFromAttributes()` into pure mapping helpers

**Files:**
- Modify: `app/plex-media-mapper.js`
- Modify: `tests/test-plex-media-mapper.js`

**Interfaces:**
- Preserve the exact exported mapper API and output shape.
- Internal helpers split identity/basic metadata, progress/playback fields, localization/context fields, and art/media fields.

- [x] Add table-driven characterization snapshots covering movie, episode, season/show, missing attributes, live/progress fields, and localized metadata.
- [x] Verify characterization passes before refactor; then add focused helper seam tests that fail until extraction.
- [x] Extract pure helpers without changing output order/values.
- [x] Run mapper consumers, full feature contracts, ES5, and both project typechecks.

### Task 8: Decompose `PlexClient.resolvePlaybackOptions()` into pure decisions

**Files:**
- Modify: `app/plex-client.js`
- Create or modify: focused Plex playback-option tests

**Interfaces:**
- Preserve `PlexClient` public API.
- Internal pure decisions: normalized preferences, selected audio policy, selected subtitle policy, final playback-option materialization.

- [x] Characterize combinations for Direct Play/Direct Stream/Transcode, subtitle modes, forced/default streams, audio preference, and missing stream metadata.
- [x] Add failing seams for the pure decisions.
- [x] Extract helpers in place; do not move HTTP, recovery, or feature-port ownership.
- [x] Run focused Plex playback-option/client suites, feature contracts, ES5, and both project typechecks.

### Task 9: Separate behavior tests from source-shape architecture guards

**Files:**
- Modify: `tests/test-tv-shell.js`
- Modify: `tests/test-playlist-queue.js`
- Modify: `scripts/check-coordinator-architecture.js`
- Modify: `scripts/check-maintainability.js`
- Create if useful: `tests/test-source-compatibility-guards.js`

**Interfaces:**
- Behavior tests assert runtime outputs/effects.
- Architecture/compatibility checks own source-text/filename/ES5-specific structural constraints.

- [x] Inventory duplicated source regex assertions and map each to an existing dedicated guard or a new compatibility guard.
- [x] Before moving each assertion, prove destination guards with existing ES5/maintainability/architecture negative fixtures and new mutated Chrome 53 compatibility fixtures.
- [x] Remove only exact duplicates from behavior tests; retain Chrome 53 source constraints in `test-source-compatibility-guards.js`.
- [x] Verify behavior and guard suites independently; the full `verify` wrapper reached the unit suite before the container ceiling, and every constituent gate was then completed independently on the same tree.

### Checkpoint C gate and export

- [x] Run full project constituent gates plus memory/Git integrity checks on the checkpoint tree.
- [x] Commit tasks 7–9 as `ceb67dbf0f0afdd44e9b38f31a29e263c4f9cb33`.
- [x] Export and independently verify `ploff-hardening-checkpoint-c-ceb67db-2026-08-19.zip` (SHA-256 `15ae5dd739a6d1b0efe81cbe14551cf21c7cae40a75b477c8eb23f68d338a883`).

---

# Checkpoint D — Input routing and resilience

### Task 10: Convert large Player/Settings input switches into explicit command routers

**Files:**
- Modify: `app/coordinator/player-feature-controller.js`
- Modify: `app/coordinator/settings-controller.js`
- Create focused pure router modules only if consumer seams remain narrow
- Modify focused Player/Settings key tests

**Interfaces:**
- Routers map normalized key + current presentation state to a command token; controllers remain owners of effects.
- No new domain service and no DOM/network side effects inside routers.

- [x] Characterize remote keys, pointer-equivalent commands, modal priority, queue drawer state, settings tab/choice state, Back, and Enter.
- [x] Add failing pure command-routing tests.
- [x] Extract routing tables/helpers and keep effects in existing controllers.
- [x] Re-run LG UX and TV-shell tests to protect remote-first semantics.

### Task 11: Harden DB8 credential storage against duplicate primary records

**Files:**
- Modify: `app/credential-vault.js`
- Modify: `tests/test-credential-vault.js`

**Interfaces:**
- Reads deterministically choose the newest valid primary record and schedule cleanup of duplicate primary records.
- Writes must not depend on a successful delete to avoid ambiguity; use stable record identity when available from DB8 results, otherwise verify/clean duplicates after write.

- [x] Add failing tests for delete failure + put success, duplicate `find` results, put failure, and remove semantics.
- [x] Implement deterministic record selection using DB8 `_id`/`_rev` metadata when supplied by the service fake while preserving session fallback.
- [x] Serialize cleanup through the existing write queue so `whenIdle()` remains correct.
- [x] Run credential/bootstrap/server runtime tests and privacy/source guards.

### Task 12: Replace numeric version splitting with a small ES5 SemVer comparator

**Files:**
- Modify the current release-status/version helper file
- Modify its focused tests

**Interfaces:**
- Stable `x.y.z` behavior stays unchanged.
- Correct ordering for `alpha`, `beta`, `rc`, numeric prerelease identifiers, and stable-vs-prerelease is added without a runtime dependency.

- [x] Add failing SemVer precedence vectors from the SemVer 2.0 ordering examples.
- [x] Implement parse/compare helpers in ES5.
- [x] Preserve behavior for malformed versions by returning the existing safe fallback.
- [x] Run update/release metadata tests and ES5/typecheck.

### Checkpoint D gate and export

- [x] Run full project constituent gates plus memory/Git integrity on the checkpoint tree; the aggregate `npm run verify` wrapper reached the unit suite before the container timeout, and all remaining constituent gates were completed independently on the same tree.
- [x] Commit Task 10 as `058c041f27dcbab8ff2dd928a2cb2fce17d538c4` and Tasks 11–12 as `46076db6f1bf30317be978fefb4d5ddfa505710c` on `develop`.
- [x] Export and independently verify `ploff-hardening-checkpoint-d-46076db-2026-08-19.zip` (SHA-256 `85f68c0c82204b62639c10520312eea2e5f221e8f708029ad232083b52ce4896`).

---

# Checkpoint E — Supply chain, TV UX options, and evidence-driven final architecture

### Task 13: Add reproducible release provenance and SBOM while preserving current release flow

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `Dockerfile`
- Modify: release documentation/tests that validate workflow invariants

**Interfaces:**
- Current SHA-pinned GitHub Actions remain pinned.
- Release artifacts gain an SBOM and GitHub artifact attestation/provenance using the current official GitHub-supported actions/permissions.
- Container/base references use immutable digests where current upstream documentation provides supported digest forms.

- [x] Verify current official GitHub documentation before choosing attestation/SBOM action versions and required permissions.
- [x] Add failing workflow-structure tests for provenance/SBOM artifacts and immutable image references.
- [x] Implement the workflow changes without changing release tag semantics.
- [x] Run YAML/source guards and release metadata/package tests locally where possible.

### Task 14: Add legacy-TV accessibility/performance preferences

**Files:**
- Modify current settings model/controller/view and locale files
- Modify generated/source styles through the established style pipeline
- Modify `ProgressiveImages` configuration only through existing settings injection
- Add focused settings/LG UX/theme tests

**Interfaces:**
- Text scale choices: 90%, 100%, 115%, 130%, applied through a root CSS variable without changing poster/card geometry.
- Reduced motion: reuse the existing `interfaceAnimations` boolean; `false` disables nonessential animations/transitions while preserving focus visibility and essential status spinners.
- Lightweight image loading: explicit boolean that caps poster/thumbnail quality at 80% and backdrop quality at 70%, keeps lower quality choices available, and reduces preview/full concurrency without an additional hidden dimension multiplier or any navigation/content-identity change.

- [x] Characterize current default settings and generated CSS/ProgressiveImages parameters.
- [x] Add failing model/controller/CSS tests for the three preferences and defaults that preserve current behavior.
- [x] Implement settings and localized labels using existing preference persistence.
- [x] Verify LG UX, themes, settings migration, image queue, and memory tests.

### Task 15: Measure startup bundling value and audit SubtitleEditorWorkflow without forced extraction

**Files:**
- Modify build tooling/tests only if the measured startup bundle experiment meets the retain criteria below.
- Modify Playback subtitle-editor code only if the cohesion criteria below are met.
- Modify architecture/performance documentation with the final evidence either way.

**Interfaces and retain criteria:**
- Core production bundling may be retained only if it preserves script execution order, ES5, source ownership guards, lazy ASS/WASM loading, and reduces initial script count by at least 75% without increasing total initial gzip bytes by more than 5%.
- Subtitle-editor extraction may be retained only if the resulting workflow has one clear purpose, consumes narrow Playback/SubtitleRuntime/Reposition capabilities, owns no native video/recovery/network transport directly, and reduces duplicated editor lifecycle state rather than moving it wholesale.

- [x] Use Task 5 startup metrics plus deterministic asset counts to create a production-bundle experiment in a temporary/generated path.
- [x] Run full runtime/order/ES5/asset tests against the experiment; keep it only if all retain criteria pass, otherwise delete the experiment and document the evidence.
- [x] Characterize `loadEditorTrack`, `openSubtitleEditor`, `applySubtitleEditor`, and Cancel/close flows with effect traces before any extraction.
- [x] Perform a dependency/cohesion audit. Extract a `SubtitleEditorWorkflow` only if all retain criteria pass; otherwise keep the facade layout and record the reason.
- [x] Run the final quantitative audit: facade sizes, startup asset counts, package bytes, hot-path budgets, memory slope, test-suite wall time as informational data, and all architecture guards.

#### Task 15 retained/not-retained evidence

- Production startup bundling is retained. The modular source baseline is 124 local scripts and
  1,937,826 raw JS bytes. The staged production path keeps `vendor/webOSTV.js` and generated
  `app.js` separate, replaces the other 122 startup modules with ordered ES5 `core.js`, and measures
  124 -> 3 scripts with aggregate gzip 442,611 -> 367,667 bytes (-16.94%). Lazy ASS/SSA runtime and
  workers remain separate.
- A new `SubtitleEditorWorkflow` is not retained. Existing `SubtitleEditorSession` and
  `PlayerSubtitleEditorController` already own the cohesive state/presentation responsibilities.
  The remaining facade flows cross Plex transport, SubtitleRuntime, rebuild, PlaybackRecovery,
  native pause state and Timeline; moving them would violate the no-network/no-recovery/no-native
  retain criteria or create a callback/service-locator layer. Characterization tests keep local-SRT
  Apply/Cancel on in-place Direct Play restore/settlement and preserve the explicit server/ASS rebuild
  cases.
- Quantitative audit on this VM: 188 `test-*.js` files plus baseline in 24.17 s; memory 0/200 standard
  and 0/100 runtime payloads retained, +0.03 MiB net and 0.01 MiB/sample slope; hot-path metrics remain
  26/12, 22/13 and 25/9 against 40/20 budgets. Current large facades are Player 2,414 lines, Playback
  2,151, Plex 1,735, Application 1,594, Detail 1,546 and Settings 1,565. The production-equivalent
  staging pipeline measures 9,779,851 unpacked bytes for app+service and 35 application-stage files.
  This VM has no `ares-package`, so no IPK byte size is claimed; actual IPK generation remains part of
  `release:package`/physical release tooling.

### Checkpoint E gate and final export

- [x] Invoke `npm run verify` fresh and run every exact constituent gate plus `npm run test:memory` on the same final tree. The aggregate wrapper repeatedly reached the unit-test phase before the execution harness timeout; its build/styles, architecture, maintainability, contracts, performance, ES5, ESLint and both typechecks were green, and the remaining `npm run test`, asset/LG UX and memory commands were then completed separately without changing the tree.
- [x] Run `git diff --check` and `git fsck --full`; only the previously known historical dangling objects remain.
- [x] Update `CHANGELOG.md`, current architecture/maintenance/testing docs, and the project roadmap only for delivered behavior.
- [x] Commit Tasks 13-15 on `develop` as `b1c5878fdd103828f883a8d1ae377b8a171cc1ba`.
- [x] Create and independently verify `ploff-hardening-checkpoint-e-b1c5878-2026-08-19.zip` with `.git`, without `node_modules`; SHA-256 `c7fff7fc371b698637ec9f1aa00729f2aa78439525d35b07f8edeafe3e90776a`.

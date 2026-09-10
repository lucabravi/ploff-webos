# Test Architecture, Documentation, and Dead-Code Cleanup Phase 5 Implementation Plan

> **For agentic workers:** execute inline task-by-task with characterization-first TDD and a commit after each independently reviewable change.

**Goal:** Finish the evidence-based cleanup by improving test locality, removing repository-wide proven-dead code, and consolidating documentation around the final ownership model without weakening LG/webOS regression coverage.

**Architecture:** Production behavior remains frozen. Test refactors preserve the exact event-order assertions and reuse one explicit playback-controller harness instead of duplicating fixtures. Dead-code removal follows the Class A/B/C evidence rules from the cleanup design. Documentation is consolidated only after code/test ownership is final.

**Tech Stack:** ES5-compatible JavaScript/UMD modules, Node.js test harness, shell baseline checks, generated app bundle, LG webOS/Chrome 53 constraints.

**Spec:** `docs/cleanup/codebase-cleanup-design.md`

## Global constraints

- Stay on `develop`; no push/tag.
- Preserve all known LG/webOS seek, buffering, Direct Play, subtitle, editor, queue, input and focus regressions.
- Runtime size/startup budgets are measured guardrails, not frozen historical targets; budget changes require an explicit architectural/correctness rationale.
- Do not delete diagnostics that remain useful for physical-TV support (`DP`/`DS`/`TC`, recovery trace, ASS timing/ownership, Web Inspector capture).
- Do not create generic shared test utilities that hide event ordering; helpers may construct fixtures and expose raw observable arrays only.
- Full `npm run verify` and `npm run test:memory` at the Phase 5 checkpoint.

---

### Task 1: Record Phase 5 baseline and test/dead-code inventory

**Files:**
- Create: `docs/cleanup/phase5-final-cleanup-inventory.md`

- [x] Record largest test/source files, current bundle/startup measurements, HEAD and test count.
- [x] Record the 149 playback-controller IIFE regression cases and identify natural behavioral split boundaries.
- [x] Inventory runtime JavaScript files against startup/build references and classify apparent orphans as production, diagnostic/on-demand, build/test-only, or deletion candidates.
- [x] Inventory remaining debug/legacy markers (`experimental`, `legacy`, `deprecated`, `shadow`, `probe`, `temporary`, `compat`) and classify Class A/B/C with evidence.
- [x] Commit inventory before structural test changes.

### Task 2: Split the oversized PlaybackController regression suite by behavior

**Files:**
- Create: `tests/helpers/playback-controller-harness.js`
- Create: `tests/test-playback-controller-core.js`
- Create: `tests/test-playback-controller-subtitles.js`
- Create: `tests/test-playback-controller-recovery.js`
- Remove: `tests/test-playback-controller.js`
- Modify: current documentation that names the monolithic file as authoritative

**Interfaces:**
- `tests/helpers/playback-controller-harness.js` exports `harness(overrides)`, `playbackFixture()`, and `playbackEffectTrace(h)`.
- Domain suites import the harness and any production modules needed only by their own assertions.

- [x] Extract only fixture/timer/video construction from lines 1-308 into the shared helper; keep assertions/test event sequences in domain files.
- [x] Move structural/startup/seek/terminal/core playback cases (original beginning through `startupDirectPlayRollbackCannotStrandStreamSwitching`) to `test-playback-controller-core.js`.
- [x] Move subtitle runtime/editor/local-renderer cases (`subtitlePreviewSuppressionAndRestore` through `cancellingEditorAfterGlobalAssEnableKeepsTheNewGlobalRendererState`) to `test-playback-controller-subtitles.js`.
- [x] Move buffering/recovery/diagnostics/reopen cases (`closeAndDestroy` onward) to `test-playback-controller-recovery.js`.
- [x] Verify the three suites contain exactly the original 149 named IIFE cases in total, with no duplicate/missing names.
- [x] Run all three suites individually and through `scripts/run-unit-tests.js`.
- [x] Update current playback documentation to name the three suites; historical cleanup plans may retain old filenames as historical records.
- [x] Commit test split with no production-code change.

### Task 2B: Split PlayerFeatureController regressions by orchestration domain

**Files:**
- Create: `tests/helpers/player-feature-controller-harness.js`
- Create: `tests/test-player-feature-presentation.js`
- Create: `tests/test-player-feature-queue.js`
- Create: `tests/test-player-feature-settings.js`
- Remove: `tests/test-player-feature-controller.js`

- [x] Extract only Player fixture/DOM/controller construction from the original first 342 lines.
- [x] Move presentation/wiring/hot-path/Up Next/control cases through `semanticDelegationDoesNotExposeImplementation`/teardown locality into `test-player-feature-presentation.js`.
- [x] Move playlist/container/adjacent/gap ownership cases through `upNextGapUsesTheSameConfirmationSurface` into `test-player-feature-queue.js`.
- [x] Move subtitle-editor/scoped preferences/quick controls/version selection cases from `subtitleEditorTrackCyclingUsesPlaybackRuntimeAuthority` onward into `test-player-feature-settings.js`.
- [x] Verify all original 87 named IIFE cases remain present exactly once and in original order.
- [x] Run the three suites independently and through the unit runner; commit without production changes.

### Task 3: Repository-wide proven-dead code and diagnostic audit

**Files:**
- Modify/remove only files identified as Class A in the Phase 5 inventory.
- Update focused tests/source-contracts for each removed family.

- [x] Compare runtime `.js` files with `app/index.html`, production bundle inputs, dynamic/on-demand loader references, webOS service/package references, and test-only imports.
- [x] For every apparent orphan, prove whether it is on-demand diagnostic/test/build infrastructure before deletion.
- [x] Search for retired experiment/shadow/timing/fallback branches and stale compatibility names in production source and docs.
- [x] Remove only Class A files/functions/exports; preserve Class B LG/webOS workarounds and useful diagnostics with explicit rationale.
- [x] For each removal family, run the nearest owner/consumer tests and ES5/source-contract checks before commit.
- [x] Commit each independent dead-code family separately.

### Task 4: Consolidate final architecture and maintenance documentation

**Files:**
- Modify: `docs/application-source-architecture.md`
- Modify: `docs/maintenance.md`
- Modify: `docs/playback-invariants.md`
- Modify: `docs/testing.md`
- Modify: `CHATGPT-HANDOFF.md`
- Modify: `CHANGELOG.md`
- Modify/archive cleanup docs only when they duplicate current authority

- [x] Update final owner map for Playback, Player, Detail, Plex Home, Plex feature ports, settings backup and subtitle-editor ASS ownership.
- [x] Replace stale migration language with steady-state architecture where current docs still describe superseded ownership.
- [x] Keep historical phase inventories/plans as implementation history, but ensure current architecture docs are the single authority for ongoing work.
- [x] Document retained test-visible `PlexClient.loadRecommendedItems` rationale and retained physical-TV diagnostics.
- [x] Update test documentation for the split playback suites and final regression matrix.
- [x] Run documentation-sensitive baseline/release-signoff tests.
- [x] Commit documentation consolidation.

### Task 5: Final cleanup verification and checkpoint

- [x] Regenerate `app/app.js` and styles from final sources.
- [x] Run `npm run verify`.
- [x] Run `npm run test:memory`.
- [x] Run `git diff --check` and `git fsck --no-dangling`.
- [x] Record final before/after metrics from behavior baseline `3389735` and cleanup-start commit.
- [x] Confirm working tree clean, no push/tag, and no WIP markers/tasks left open except explicitly deferred feature TODOs such as OK-on-visible-Skip-Intro/Credits.
- [x] Create a complete `.git` checkpoint ZIP if the periodic checkpoint window or end-of-cleanup has been reached.

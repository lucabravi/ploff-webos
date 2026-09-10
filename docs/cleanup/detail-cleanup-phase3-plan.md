# Detail Cleanup Phase 3 Implementation Plan

> **For agentic workers:** execute inline task-by-task with characterization-first TDD and a commit after each independently reviewable change.

**Goal:** Move playback-progress ownership into `DetailController`, prune only proven Detail facade glue, and preserve all Detail/rewatch/season/navigation behavior.

**Architecture:** `DetailController` already owns `currentDetail`, `selectedItem`, `seriesContext`, and their semantic mutation API. The six-second local playback checkpoint that protects against stale Plex metadata therefore belongs there, while `DetailFeatureController` remains responsible for Plex I/O, presentation repaint, and retry scheduling. Existing presentation/extended-view owners remain unchanged unless evidence proves duplicate state.

**Spec:** `docs/cleanup/codebase-cleanup-design.md`

## Global constraints

- Stay on `develop`; no push/tag.
- Preserve rewatch progress-bar semantics and stale-Plex checkpoint protection.
- Preserve Detail remote/focus/navigation, watched/watchlist, season bulk, extended metadata/extras, and media preference behavior.
- No new runtime module for this phase; use the existing `DetailController` owner.
- Record bundle impact of each ownership move. Phase 3 historically remained below the `899972` behavior baseline; later phases may accept reviewed runtime growth for clearer ownership.
- TDD before ownership changes; full `npm run verify` and `npm run test:memory` at phase checkpoint.

---

### Task 1: Inventory Detail ownership

- [x] Record baseline metrics and private state families.
- [x] Classify `pendingProgress` as duplicated model ownership outside `DetailController`.
- [x] Classify extended-root/request keys, season-bulk guard, request/timer ownership, presentation key and activation token as behavior-bearing unless proven otherwise.
- [x] Scan one-consumer helpers and retain semantic transforms/guards.
- [x] Commit inventory.

### Task 2: Move local playback checkpoint ownership to DetailController

**Files:**
- Modify: `app/coordinator/detail-controller.js`
- Modify: `app/coordinator/detail-feature-controller.js`
- Test: `tests/test-detail-controller.js`
- Test: `tests/test-detail-feature-controller.js`
- Regenerate: `app/app.js`

**Interface:**
- `recordPlaybackProgress(ratingKey, seconds)` patches owned matching models and stores the bounded local checkpoint.
- `reconcilePlaybackEpisodes(freshEpisodes)` applies fresh Plex playback state while protecting a newer local checkpoint and returns whether that checkpoint remains pending.
- `playbackProgressPending(ratingKey)` reports whether the bounded checkpoint is still active.
- controller reset/close/destroy clears the checkpoint.

- [x] Write DetailController tests for current/selected/episode patching, percentage scale, stale Plex protection, server catch-up clearing, expiry, and reset.
- [x] Verify RED because the semantic methods do not yet exist.
- [x] Implement minimal owner methods in `DetailController`.
- [x] Replace feature-level `pendingProgress` and patch loops with owner calls; keep view repaint and Plex retry in the feature.
- [x] Run Detail controller/feature/episode-view/TV-shell tests and rebuild bundle.
- [x] Commit.

### Task 3: Prune proven Detail facade aliases

- [x] Re-run one-consumer scan after the ownership move.
- [x] Inline only pure pass-through helpers whose names carry no domain policy and whose removal does not increase bundle size.
- [x] Keep public feature-contract adapters and helpers that encode navigation/presentation/async ownership semantics.
- [x] Run Detail suites, feature contracts and source-compatibility tests.
- [x] Commit only if evidence yields safe removals.

### Task 4: Phase 3 verification and documentation

- [x] Run `npm run verify`.
- [x] Run `npm run test:memory`.
- [x] Run `git diff --check`, performance budget and `git fsck --no-dangling`.
- [x] Record before/after Detail and bundle metrics and retained state rationale.
- [x] Update `CHANGELOG.md` and `CHATGPT-HANDOFF.md`.
- [x] Commit Phase 3 checkpoint documentation.

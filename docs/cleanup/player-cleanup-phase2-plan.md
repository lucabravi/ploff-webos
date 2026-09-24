# Player Cleanup Phase 2 Implementation Plan

> **For agentic workers:** execute inline task-by-task with characterization-first TDD and a commit after each independently reviewable change.

**Goal:** Reduce duplicated UI/orchestration state and redundant glue in `PlayerFeatureController` without changing Player focus, remote, queue, resume, subtitle-editor, or playback behavior.

**Architecture:** Keep `PlayerFeatureController` as the screen orchestrator and existing `PlayerControlsController`, `PlayerQueueController`, `PlayerSubtitleEditorController`, `PlaybackQueueController`, and `QueueGapController` as authoritative owners. Prefer deriving facade state from those owners over introducing new booleans or new modules. Remove only pure monouse wrappers after consumer evidence proves they add no semantic translation.

**Spec:** `docs/cleanup/codebase-cleanup-design.md`

## Global constraints

- Stay on `develop`; no push/tag.
- No UI/UX or key/focus behavior change.
- No new runtime module unless it removes more shipped code than it adds.
- Preserve public feature contract and all existing Player controller methods.
- Keep generated `app/app.js <= 899704` raw bytes, the Phase 1 checkpoint size.
- TDD/characterization before state ownership changes.
- Full `npm run verify` and `npm run test:memory` at phase checkpoint.

---

### Task 1: Record Player state/ownership inventory

**Files:**
- Create: `docs/cleanup/player-phase2-inventory.md`
- Inspect: `app/coordinator/player-feature-controller.js`
- Inspect: existing Player/queue/subtitle owner modules and tests.

- [x] Record baseline lines/bytes and private state families.
- [x] Classify `queueGapVisible` as duplicate of `QueueGapController.snapshot().open`.
- [x] Classify `resumeChoiceVisible` as duplicate of nullable `resumeChoiceState`, after verifying every close/start path clears the state.
- [x] Mark player error state, transition timers, autoplay image and ASS prefetch state as behavior-bearing/uncertain unless separate evidence proves otherwise.
- [x] Scan private symbols for declaration-only usage and one-use pure wrappers.
- [x] Commit inventory.

---

### Task 2: Remove duplicate Queue Gap visibility state

**Files:**
- Modify: `app/coordinator/player-feature-controller.js`
- Modify: `tests/test-player-feature-controller.js`
- Regenerate: `app/app.js`

**Interface:** `queueGapOpen()` remains a private semantic query, but derives directly from `queueGapController.snapshot().open`; `renderQueueGap()` no longer mirrors open state into a facade boolean.

- [x] Add/identify a regression test that opens a queue-gap confirmation, observes Player snapshot/input routing as open, closes/invalidate it, and observes closed state.
- [x] Mutation-check that bypassing owner snapshot makes that test fail.
- [x] Delete `queueGapVisible` and assignment in `renderQueueGap()`.
- [x] Implement `queueGapOpen()` from `queueGapController.snapshot()`.
- [x] Run queue gap, Player feature and input-routing tests.
- [x] Rebuild bundle; require no size increase.
- [x] Commit.

---

### Task 3: Remove duplicate Resume Choice visibility state

**Files:**
- Modify: `app/coordinator/player-feature-controller.js`
- Modify: `tests/test-player-feature-controller.js`
- Regenerate: `app/app.js`

**Interface:** resume-choice visibility is derived from `resumeChoiceState !== null`; `featureSnapshot().resumeChoiceOpen`, `handleResumeChoiceKey()`, `pointerFocus()` and `openStandalone()` use the derived state.

- [x] Add/identify regression coverage for opening a resumable item, keyboard/pointer routing while open, cancel/start clearing state, and `featureSnapshot().resumeChoiceOpen`.
- [x] Verify RED by temporarily deriving the wrong open value.
- [x] Delete `resumeChoiceVisible` and all paired assignments.
- [x] Replace checks/returns with `resumeChoiceState !== null`.
- [x] Run Player feature/controls/input tests.
- [x] Rebuild bundle and require no size increase.
- [x] Commit.

---

### Task 4: Prune monouse pure facade wrappers

**Files:**
- Modify: `app/coordinator/player-feature-controller.js`
- Update: `docs/cleanup/player-phase2-inventory.md`
- Regenerate: `app/app.js`

- [x] Enumerate named private functions with exactly one internal consumer.
- [x] Keep functions that name a domain invariant, transform data, guard destroyed state, or are passed as callbacks/public contract members.
- [x] Inline only pure aliases such as a direct `call(port.method, ...)` or direct owner method with no semantic normalization.
- [x] Run `test-player-feature-controller`, `test-player-feature-hot-paths`, controls/queue/subtitle-editor suites and feature contracts.
- [x] Record exact removed wrappers and before/after metrics.
- [x] Commit.

---

### Task 5: Phase 2 verification and documentation

**Files:**
- Modify: `CHANGELOG.md`
- Update: `docs/cleanup/player-phase2-inventory.md`
- Regenerate: `app/app.js`

- [x] Run `npm run verify`.
- [x] Run `npm run test:memory`.
- [x] Run `git diff --check`, performance budget and `git fsck --no-dangling`.
- [x] Record Player controller and bundle before/after metrics.
- [x] Document deliberately retained state/owners and physical-LG validation requirement.
- [x] Commit Phase 2 checkpoint documentation.

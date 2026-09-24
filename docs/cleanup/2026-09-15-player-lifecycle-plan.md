# Player Lifecycle Implementation Plan

> Execute inline, task-by-task, with the executing-plans workflow and verification checkpoints.

**Goal:** Make asynchronous playback ownership explicit without changing playback features.

**Architecture:** A small single-operation owner replaces duplicated request bookkeeping.
Per-playback transport snapshots, native-play tokens and explicit queue command invalidation
separate session lifetime from source readiness and queue-cache lifetime.

**Tech Stack:** Existing dependency-free ES5 UMD runtime, Node test harnesses, generated bundles.

**Spec:** `docs/cleanup/2026-09-15-player-lifecycle-design.md`

## Global constraints

- Minimum runtime: Chrome 53; no added runtime dependencies or modern browser APIs.
- Preserve delivery/clock/subtitle behavior unless a regression test demonstrates a defect.
- Regenerate bundles, do not hand-edit generated output.
- Keep the authoritative Git ancestry and do not push.

## 1. Single-operation owner and native-play issuance

Files: `app/playback-operation.js`, `app/playback-session.js`,
`tests/test-playback-operation.js`, `tests/test-playback-session.js`.

- [x] Write operation tests for sync/deferred, duplicate, reentrant start, late handle,
  throwing abort, destroyed slot and multi-stage completion. Write native issuance test:
  `old = session.beginNativePlay(); session.finishNativePlay();`
  `next = session.beginNativePlay(); session.finishNativePlay(old);`
  `assert.strictEqual(session.nativePlayPending(), true);`
- [x] Run `node tests/test-playback-operation.js` and `node tests/test-playback-session.js`;
  record expected RED before implementation.
- [x] Implement the spec's `create / begin / run / current / pending / cancel / destroy`
  contract. Finish old native requests only when their issuance token matches.
- [x] Run focused tests, parser/lint/type checks and commit the independent owner.

## 2. Migrate Playback operations and selection transaction

Files: `app/coordinator/playback-controller.js`, `app/coordinator/player-feature-controller.js`,
`app/coordinator/player-composition.js`, `scripts/build-app.js`, harness injection and lifecycle tests.

- [x] Write behavioral tests for stale native rejection, reverse-order selection,
  same-session duplicate prepare, synchronous load/prepare, close during load and
  supersession while obtaining a request handle.
- [x] Run against old facade and record failures.
- [x] Replace request/complete/generation triples with explicit operation slots. Keep
  phase-specific clock timers and readiness policy separate. Consolidate selection
  application and compute its commit position from current playback/pending seek.
- [x] Protect subtitle renderer continuations and restore completion with their slot.
- [x] Run Playback core/recovery/subtitle/source-clock/HLS-clock suites and full gates;
  inspect the diff before committing.

## 3. Per-playback transport and unconditional teardown

Files: Playback facade, Timeline, NativeVideoDriver, subtitle editor binding, lifecycle tests.

- [x] Tests: mutate candidate config A to B before open and assert A's stopped report
  still uses A; close while editor offset write is pending and assert compensation uses A.
- [x] Tests: `abort()` / renderer / native pause / event removal throws; all remaining
  cleanup still runs, no retained active playback and destroy stays terminal.
- [x] Capture config per open; bind Timeline through `reset(config)` and keep internal
  reopen on the old route. Bind editor restoration to its originating config.
- [x] Detach logical state before external release; continue cleanup and unbinding
  before surfacing the first error. Preserve normal close/open effect ordering.
- [x] Run focused tests, full gates and memory checks; commit.

## 4. Queue command lifetime at Player exit

Files: `playback-queue-controller.js`, `player-feature-controller.js`, queue/feature tests.

- [x] Reproduce pending metadata/adjacent results delivered after close.
- [x] Add `cancelPendingPlayback()` preserving queue/cache/origin while invalidating
  metadata, adjacent, direct-start and autoplay commands. Call at exit and replacement.
- [x] Ensure returning to a playlist or issuing a new explicit request still succeeds.
- [x] Run queue/providers/feature/full tests and commit.

## 5. Review and verified delivery

- [x] Re-read source changes against the design; no unrelated policy or UI rewrite.
- [x] Update permanent architecture/invariants/docs index and append measured outcomes.
- [x] Run `npm run build:app`, `npm run verify`, `npm run test:memory`,
  `git diff --check`, `git fsck --no-dangling` and retain complete logs.
- [x] Commit, inspect ancestry and clean status, package `.git` and project sources,
  independently verify extraction against the committed tree, publish SHA-256.

## Execution record

Implementation checkpoints: `5b8fa87`, `94fe398`, `3e0da5a`, `44d677f`.
The full integrated verification passes 260 unit test files plus all verify gates;
ES5 covers 182 runtime files. Memory verification also passes. Some intermediate
full runs were interrupted or exposed test-injection/source-expectation mismatches;
those logs are retained and are not represented as passing per-commit full gates.
Focused RED/GREEN evidence, the successful integrated gate and the final package
extraction check are recorded separately in the delivery evidence.

Runtime metrics and remaining physical-TV acceptance are in the audit. Delivery
contains Git history and application sources; the two unchanged font assets must be
restored from the user's original baseline using the packaging instructions.

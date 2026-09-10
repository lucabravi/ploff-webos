# Playback cleanup Phase 1 inventory

Date: 2026-09-06
Branch: `develop`
Inventory baseline: `375ced7` (cleanup design/plan relocated into project documentation)
Behavior baseline: `3389735`

## Baseline metrics

| File | Lines | Bytes |
| --- | ---: | ---: |
| `app/coordinator/playback-controller.js` | 2966 | 144737 |
| `app/subtitle-runtime.js` | 285 | n/a |
| `app/playback-session.js` | 260 | n/a |
| `app/playback-reposition.js` | 103 | n/a |
| generated `app/app.js` | n/a | 899972 |

Full `npm run verify` reaches all application/unit gates successfully. The project baseline shell also passes after keeping cleanup planning under `docs/cleanup/`, because the repository intentionally forbids `docs/superpowers/`.

## Ownership classification

### Local subtitle seek presentation gate -> `SubtitleRuntime`

Current controller-private family:

- `subtitleSeekGate`
- `beginSubtitleSeekGate()`
- `markSubtitleSeekRebuffer()`
- `releaseSubtitleSeekGate()`

Production consumers are confined to `PlaybackController` seek/event/close orchestration. The state itself answers a presentation question: whether the local subtitle overlay may become visible while the native decoder is still proving the settled seek clock. It does not decide seek targets or keyframe acceptance.

Target ownership:

- `PlaybackReposition`: decides/settles decoder position;
- `PlaybackController`: tells the owners when a seek, rebuffer, `playing`, or `timeupdate` occurs;
- `SubtitleRuntime`: owns the presentation gate state and exposes narrow query/mutation operations.

The physical-LG regressions that protect this move are the paused seek `629 -> play -> 623` sequence and the already-playing/no-rebuffer `629 provisional -> 623 settled` sequence. The gate must also release promptly when the native clock actually advances without rollback.

### Native seek verification -> facade orchestration for Phase 1

State:

- `nativeSeekVerificationTimer`

Reason to retain: the timer bridges native driver events, `PlaybackReposition` policy, and recovery/reopen orchestration. Moving the timer into `PlaybackReposition` would make that otherwise deterministic policy owner perform scheduling and recovery side effects.

### Clock repair -> facade cross-owner orchestration for Phase 1

State:

- `clockRepairTimer`
- `clockRepairFallbackTimer`
- `clockRepairGeneration`
- `clockRepairCount`

Reason to retain: current logic coordinates native time, `PlaybackSession` clock-discontinuity generation, `PlaybackTimeline`, and recovery. It is behavior-bearing and not a clean owner move yet.

### Buffer resume -> facade cross-owner orchestration for Phase 1

State:

- `bufferResumeTimer`
- `bufferResumeGeneration`

Reason to retain: the controller coordinates native ready state, buffered ranges, reposition policy, playback lifecycle, and diagnostics. Existing `PlaybackSession` owns incident state but not native polling/scheduling.

### Seek/reopen orchestration -> facade

State:

- `pendingSeek`
- `seekTimer`
- `pendingRestore`
- `resumeTimer`
- `recoveryTimer`
- `rebuildReason`

Reason to retain: these values coordinate multiple existing owners and transport requests. They are orchestration rather than a cohesive lower-level policy.

### Local subtitle loading -> uncertain; characterize only in Phase 1

State:

- `localSubtitleRequest`
- `localSubtitleGeneration`
- `localSubtitleLoading`

The runtime owns active local subtitle state/rendering, but the controller currently owns Plex request cancellation/generation and rebuild sequencing. No move is justified until request ownership is characterized separately.

### Subtitle editor integration -> out of Phase 1 ownership move

State:

- `subtitleEditorState`
- `subtitleEditorRequest`
- `subtitleEditorGeneration`
- `subtitlePreviewTimer`

Reason to retain: this is cross-owner integration between playback, `SubtitleEditorSession`, local subtitle runtime, Plex stream selection, and Player UI callbacks. It is a later cleanup family and must not be mixed into seek-gate extraction.

### Playback transport requests -> facade

State:

- `playbackLoadRequest`
- `playbackLoadGeneration`
- `playbackPrepareRequest`
- `generation`

Reason to retain: these are cancellation/stale-callback guards around the facade's orchestration of Plex load/prepare and playback owners.

### Diagnostics/compatibility dedupe -> behavior-bearing

State:

- `recoveryTrace`
- `compatibilityAttemptToken`
- `compatibilityRecordedToken`
- `directFailureNotifiedToken`
- `debugSourceGeneration`
- `debugBufferGeneration`
- `debugPendingBufferSignal`

Reason to retain: diagnostics and compatibility-memory writes are deliberately deduplicated across asynchronous recovery attempts. These fields have real production consumers and existing tests.

## Proven-dead scan

A lexical scan of every controller-private `var` and named private `function` found no symbol with declaration-only usage. Every private symbol occurs at least twice inside the controller (definition plus at least one consumer), so Phase 1 starts with **no declaration-only deletion candidate**.

This does not prove every branch is reachable. Branch-level deletion requires separate control-flow/history evidence; no branch is removed from intuition alone.

## Class B retained platform behavior

The following are explicitly behavior-bearing and are not cleanup targets merely because they look unusual:

- Direct Play keyframe rollback / decoder settlement;
- different startup and ordinary-seek advancement thresholds;
- stale seek-verification rejection;
- Direct Play sticky reopen/retry and classified fallback;
- terminal-window native clock handling;
- local ASS discontinuity when an earlier keyframe is adopted;
- provisional local-subtitle presentation suppression;
- webOS ordering guards involving `playing`, `waiting`, `stalled`, `seeked`, `timeupdate`, and `readyState`;
- stale asynchronous request-generation guards.

## Phase 1 first ownership move

The only ownership move approved by current evidence is the local subtitle seek presentation gate from `PlaybackController` to `SubtitleRuntime`. Other state families remain in the facade until a later focused characterization demonstrates a cleaner owner.

## Phase 1 pruning result after subtitle-gate ownership move

After moving seek-presentation state to `SubtitleRuntime`, four facade helpers became pure aliases with no remaining semantic translation and were removed:

- `beginSubtitleSeekGate()` -> direct `SubtitleRuntime.beginSeekPresentation()` calls;
- `markSubtitleSeekRebuffer()` -> direct `SubtitleRuntime.markSeekRebuffer()` calls;
- `stopKeepalive()` -> direct `PlaybackTimeline.stopKeepalive()` calls;
- `stopReporting()` -> direct `PlaybackTimeline.stopReporting()` calls.

No named helper that encodes a playback/webOS invariant was inlined. In particular decoder settlement, terminal pause, compatibility classification, buffering assessment, and recovery naming remain explicit.

Metrics after this pruning:

| Metric | Baseline | Current | Delta |
| --- | ---: | ---: | ---: |
| `playback-controller.js` lines | 2966 | 2945 | -21 |
| `playback-controller.js` bytes | 144737 | 144300 | -437 |
| generated `app/app.js` bytes | 899972 | 899704 | -268 |

Repository-wide symbol scanning still yields no declaration-only playback private symbol. No branch-level legacy deletion is claimed in this step.

## Class B ownership clarification

Retained LG/webOS-specific behavior now has explicit ownership comments/documentation:

- `PlaybackReposition` owns the one bounded, seekable keyframe rollback after webOS exposes an optimistic target first;
- `SubtitleRuntime` owns suppression of provisional local-subtitle pixels until the controller supplies enough lifecycle/native-clock evidence to release them;
- `PlaybackController` remains the coordinator that supplies events and invokes the two owners, rather than owning either policy state itself.

The remaining Direct Play sticky recovery, terminal-window handling, stale verification, and event-order guards stay named in `PlaybackController` because they still coordinate multiple owners.

## Phase 1 checkpoint

Verified commit sequence before checkpoint documentation:

- `9b4bc7e` - Document playback cleanup inventory
- `d379bbe` - Move subtitle seek presentation state to runtime
- `edcb8db` - Remove redundant playback controller glue
- `ff65b8d` - Document retained webOS playback invariants

Final verified metrics:

| Metric | Baseline `3389735` | Phase 1 | Delta |
| --- | ---: | ---: | ---: |
| `playback-controller.js` lines | 2966 | 2945 | -21 |
| `playback-controller.js` bytes | 144737 | 144300 | -437 |
| `app/app.js` raw bytes | 899972 | 899704 | -268 |
| `app/app.js` gzip bytes | 177769 | 177681 | -88 |

Verification: `npm run verify` PASS; `npm run test:memory` PASS with 0/200 weak payloads, 0/100 runtime payloads and 0.03 MiB net heap growth; performance budget PASS; `git diff --check` PASS; `git fsck --no-dangling` PASS.

Phase 1 deliberately leaves the remaining cross-owner timers, request generations, recovery diagnostics, compatibility dedupe and subtitle-editor integration in the facade. Their presence is not evidence of dead code.

# Runtime architecture redesign

## Status

Implemented on `develop` on 2026-08-19 through checkpoints `9e4e4a6`..`982229c`. This document
records the resulting runtime boundaries and their extension rules; `TODO.md` retains the checkpoint
execution log. The characterized behavior remains the golden contract until a focused regression
test intentionally changes it.

## Goal

Replace "do not touch this area" safety rules with explicit owners, small capability interfaces,
and regression tests that make Playback and Player internals safe to evolve without weakening the
legacy webOS constraints or Plex behavior.

## Product constraints that remain requirements

- Runtime code under `app/` and `webos-service/` remains dependency-free ECMAScript 5 for the
  Chrome 53 webOS WebView.
- Native playback behavior, Plex delivery-mode semantics, Settings persistence, privacy rules,
  remote-first LG UX, and current subtitle behavior remain compatible unless a separately tested
  defect requires a behavior change.
- Generated `app/app.js` and `app/styles.css` are never edited directly.
- Every architectural checkpoint must pass `npm run verify`, `npm run test:memory`, and
  `git diff --check` before it is committed and packaged.
- Work remains on the existing `develop` branch. No worktree or migration branch is introduced.

## Design principles

### Golden behavior before structural movement

The controller integration suite remains the final authority for externally visible behavior. New
unit tests may move behavior into smaller modules, but they never replace integration coverage for
source writes, native seeks, Plex reports, recovery transitions, buffering, subtitle timing, stale
async callbacks, teardown, or Player callbacks.

Where a boundary is sensitive, tests first record the observable effect trace: native source writes,
seek writes, `preparePlayback()` calls, timeline reports, fallback-plan transitions, subtitle
renderer operations, and Player callbacks.

### NativeVideoDriver owns the physical media element

`NativeVideoDriver` becomes the only runtime module allowed to mutate or command `#player-video`.
It owns source assignment/removal, native seek writes, play/pause/load, event registration, and
read-only native observations such as `currentTime`, `duration`, `paused`, `buffered`, and
`seekable`.

The driver does not decide *when* to seek, recover, report, or render subtitles. It provides a small
imperative capability surface to Playback orchestration and can be replaced by a deterministic fake
in focused tests.

### PlaybackSession owns semantic transient state

`PlaybackSession` owns native readiness, play issuance, seek/startup and transient
playback state. Its lifecycle label is derived from those facets, not a second
independent state machine. Buffering, readiness and seek evidence are not collapsed
into one combinatorial enum.

The September 15 lifecycle review adds an issuance token for native `play()` and a
synchronous `closing` barrier. Timers and external effects remain with their owners.
Replaceable requests use `PlaybackOperation`; per-playback configuration and resource
release are documented in [playback lifecycle ownership](player-lifecycle-ownership.md).

### Reposition and recovery are separate capabilities

`PlaybackReposition` owns absolute seek decisions, native relative targets, seek verification, and
the bounded Direct Play decoder settlement already proven on LG hardware. It may request a recovery
when the current source cannot reach a target, but it never advances a recovery plan itself.

`PlaybackRecovery` remains the only capability allowed to advance delivery fallback
`Direct Play -> Direct Stream -> Transcode -> Safe Transcode`. A routine seek, resume restore,
chapter jump, or subtitle-editor Apply/Cancel must not accidentally advance that plan.

### SubtitleRuntime owns active subtitle behavior

`SubtitleRuntime` becomes the single owner of active SRT/WebVTT/ASS behavior: local overlay state,
ASS renderer lifecycle, failed-stream state, editor eligibility, runtime offset, preview payload,
and subtitle rendering against the confirmed playback clock.

`SubtitleEditorSession` remains a pure draft/session state object. `PlayerSubtitleEditorController`
remains presentation-only. SubtitleRuntime never assigns a media source or native time directly; it
asks PlaybackReposition when a reposition is required.


#### Subtitle-editor workflow re-audit (2026-08-19)

No additional `SubtitleEditorWorkflow` owner is introduced. The cohesive responsibilities are already
split: `SubtitleEditorSession` owns draft/original state and Apply/Cancel transitions, while
`PlayerSubtitleEditorController` owns presentation/input. The remaining Playback operations are
cross-boundary orchestration rather than duplicate lifecycle state: `loadEditorTrack` coordinates
Plex text transport, SubtitleRuntime and rebuilds; Apply can write Plex stream/offset state, persist
local offsets and, when delivery must change, coordinate PlaybackRecovery; restore can coordinate
SubtitleRuntime, native pause state, Timeline and rebuild.

Characterization coverage freezes the observable traces before retaining this layout: local SRT
Apply/Cancel restore the editor-open point through the in-place Direct Play seek path and adopt the
decoded keyframe without source replacement, while server-rendered and ASS cases rebuild only when
their delivery/ownership contract requires it. Moving these calls into a new object would either give
that object forbidden network/recovery/native responsibilities or create a thin callback/service-locator
layer, so it fails the hardening plan's cohesion criteria.

### Timeline reporting is extracted only if the boundary stays coherent

After NativeVideoDriver, PlaybackSession, Reposition, and SubtitleRuntime are extracted, the
remaining clock/timeline/reporting code is re-audited. If public clock, progress, estimated end,
Plex timeline, and keepalive form one coherent owner, they move to `PlaybackTimeline`; otherwise the
orchestrator keeps the smallest correct grouping rather than forcing an artificial module.

The checkpoint-3 audit confirmed that boundary: `PlaybackTimeline` owns stable/public clock state,
progress/end presentation, suppression, Plex timeline reporting, and transcode keepalive. Clock
repair, seek/rebuild decisions, decoder-settlement policy, and recovery remain cross-owner
orchestration rather than being absorbed into the timeline capability.

### PlaybackController becomes an orchestration facade

`PlaybackController` keeps the existing reviewed public API unless a consumer audit proves an API
change is beneficial. It coordinates the smaller owners and contains cross-owner use cases, but
should not re-implement their internal policy.

### PlayerFeatureController becomes screen orchestration

After Playback stabilizes, the next large cohesive responsibility is the Player queue/drawer. A new
`PlayerQueueController` owns queue presentation state, retained occurrence cards, focus/navigation,
artwork prefetch, drawer lifecycle, and queue-specific DOM reconciliation. Playback queue resolution
and provider fetching remain in their existing domain modules.

Further Player extraction happens only when the remaining state demonstrates a similarly clean
owner; file-size reduction alone is not a reason to split code.

The Checkpoint 4 re-audit confirmed that boundary. After queue presentation moved out, the
remaining Player state is distributed across distinct cross-owner use cases: resume/error panels,
queue-gap coordination, container-origin transitions, Up Next backdrop/countdown coordination,
subtitle/settings panel transitions, and episode commands. Those responsibilities do not form one
cohesive owner, so no additional extraction is justified by the current consumers/tests.

### PlexClient cleanup follows consumer capabilities

The existing `PlexFeaturePorts`, `PlexMediaDocument`, and `PlexMediaMapper` remain the direction of
travel. After Player/Playback dependencies are narrowed, compatibility-only global helpers are
re-audited. Removing a historical global export is allowed only when no repository contract,
documentation, production consumer, or practical compatibility value remains.

The September 2026 consumer audit revalidated every feature-port operation and narrowed the
`PloffClient` facade around transport/lifecycle ownership. Pure URL, media mapping/parsing,
playback-option and Home/recommendation shaping now live in focused owners. The reviewed facade
contains 36 operations: 35 have production consumers, while `loadRecommendedItems` remains the
single intentionally test-visible transport seam because its direct tests protect recommendation
cache/LRU, concurrency, retry and stale-response races. Future facade additions require a concrete
production, migration, or equally precise behavioral-test need.

## Guard migration

Architecture guards move with ownership instead of freezing historical filenames:

- native-video mutation guard: from `playback-controller.js` to `native-video-driver.js`;
- subtitle policy guard: from `playback-controller.js` to `subtitle-runtime.js`;
- timeline/keepalive guard: direct Plex timeline traffic belongs to `playback-timeline.js`;
- recovery guard: `playback-reposition.js` may not depend on `PlaybackRecovery` or advance
  fallback-plan state;
- queue-presentation guard: retained occurrence-card/artwork/render state belongs to
  `player-queue-controller.js`;
- input hotspot budgets remain regression alarms and are not tightened for cosmetic reasons;
- controller-contract tests continue to freeze externally reviewed APIs, not private file layout.

## Checkpoint strategy

The implementation is intentionally incremental and each checkpoint is independently recoverable:

1. plan + golden effect traces;
2. NativeVideoDriver + PlaybackReposition boundary;
3. PlaybackSession + SubtitleRuntime boundary;
4. remaining Playback facade/timeline audit;
5. Player queue/presentation extraction;
6. Plex/API cleanup + final guards/docs/audit.

Each checkpoint receives an atomic commit and a full ZIP containing `.git` but excluding
`node_modules`. Intermediate ZIPs are recovery artifacts; execution continues automatically after
they are produced.

## Success criteria

- no product behavior regression in automated tests or the retained physical-TV matrix;
- `npm run verify` and `npm run test:memory` remain green at every checkpoint;
- typecheck remains at zero diagnostics;
- no generic service locator or shared mutable context is introduced;
- native video, recovery, reposition, playback lifecycle, clock/reporting, subtitle runtime, and
  Player queue presentation each have a single understandable owner with focused tests;
- maintainability guards describe current architecture rather than historical file taboos;
- final documentation explains *why* boundaries exist and how to extend them safely.

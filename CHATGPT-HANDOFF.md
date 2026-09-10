# Ploff archive handoff

This file is the operational handoff for the current `develop` checkpoint. Permanent
repository rules remain authoritative in `AGENTS.md`; current documentation is indexed by
`docs/README.md`.

## Current work - 2026-09-06 maintenance and deferred Player startup

The clean starting checkpoint is `caebbe454fefd7d95fe4a26943c43bbe210b3bc2`.
The user approved the maintenance recommendations followed by the existing deferred
Player design, with a verified commit and complete `.git` checkpoint ZIP after each
completed task. No push, tag, version bump, branch, or worktree is authorized.

Documentation, Settings declaration parity, architecture-tool parsing, runner
observability, and the standalone Player loader were completed as separate verified
checkpoints. The integrated runtime now ships Core `app.js` and deferred `player.js`:
Player composition follows one readiness path, warm begins 1,000 ms after focusable
Home, and enabled local ASS warm remains independent and reuses the same pool.

First Play, extras, and cold playlist/collection remote/pointer activation retain one
cancellable semantic intent. Player/Playback partial construction and initial
translation clean up locally without destroying Core. Ready paths remain synchronous.
The source manifests and generated/release gates cover both artifacts. Read the
active plans linked from `docs/README.md` and the measured checkpoint in
`docs/testing.md`; physical LG responsiveness/playback acceptance is still pending.

The maintenance sequence is complete. The Settings backup boundary was retained
rather than adding an artificial owner; restore completion and store read/teardown
paths were hardened with real-dialog and real-format regression tests. Read
`docs/cleanup/2026-09-06-settings-backup-boundary-review.md` for the decision and
accepted-write semantics. The next acceptance work is physical-LG validation, not
repeating the completed implementation tasks.

The sections below preserve prior implementation rationale and historical evidence.
Their phase-specific "next" steps and measurements are not a replacement for the
active plans or fresh verification at the archive's actual HEAD.

## Git / archive state

- Branch: `develop`.
- The authoritative checkpoint commit is the `HEAD` contained in the archive; use
  `git log -1 --oneline` after extraction.
- The archive is expected to contain the full working tree, `.git`, and generated runtime
  artifacts (`app/app.js`, `app/player.js`, `app/styles.css`, and the legacy ASS worker). Checkpoints for this work include expanded `node_modules/` for offline
  reproduction; dependencies remain governed by `package-lock.json` and outside Git.
  `dist/`, IPKs, and temporary build products are excluded.
- No push is implied by this handoff.

## Current sticky Direct Play recovery model

The J/K/L/M timing experiments are retained in Git history and historical reports but are no longer
the production behavior. Direct Play is now sticky while the selected media/track combination remains
technically usable:

- ordinary seeks remain on the existing native seek path and do not reload playback;
- the first non-terminal Direct Play recovery rebuild may perform one guarded internal cold reopen at
  the requested absolute Plex position, using the same normal `loadPlayback()` / strategy / recovery
  startup as a fresh Player open;
- while that cold reopen is still settling, another seek/buffer/clock/timeout/mismatch/stream-switch
  rebuild retries the same Direct Play delivery and records `RETRY[...]`; it no longer consumes Direct
  Stream merely because Direct Stream is the next item in the recovery plan;
- terminal-window Direct Play keeps the full-file native clock and final-end handling. The eleven-second
  terminal lookback remains only for an already-selected Direct Stream/transcode delivery;
- unclassified Direct Play native/prepare failures stop the bounded recovery on Direct Play. Direct
  Stream fallback remains available only after confirmed compatibility evidence (codec/decoder/format/
  container class), or when normal capability planning already excludes Direct Play;
- a steady-state VOD Direct Stream seek whose reposition decision is `rebuild` still performs the same
  internal cold reopen; the sticky rule does not convert Direct Stream back into Direct Play;
- the Player view stays mounted and `onOpening` / `onPlaybackLoaded` presentation resets are suppressed
  for the internal reopen. Pause state and current media/part, track, playback-mode and quality
  preferences are preserved;
- a healthy local ASS renderer is hidden but not disposed during the internal reopen. Reloading the same
  ASS id/content reuses the existing libass worker/track, preserving the warm renderer;
- if Advanced Subtitle Settings is open, its draft track/size/offset/loop state and original restore
  payload survive the reopen. Playback-bound references are rebound to the fresh session, an in-flight
  preview load is aborted/restarted, reporting remains suppressed while editing, and Apply/Cancel retain
  the new transport fields instead of restoring stale pre-reopen delivery/offset state;
- the Direct Play cold-reopen guard is cleared only after reopened playback reaches stable `playing`, so
  later independent incidents may cold-reopen again without creating a reopen loop;
- the experimental automatic shadow HLS timing probe remains retired from normal startup.
  `debug-capture.js` and `debug-timing-probe.js` remain explicit Web Inspector diagnostics only.

Physical LG validation remains authoritative; this checkpoint has automated coverage but does not claim
that the new sticky behavior has already been signed off on a TV.

### Recovery trace diagnostics

- The compact Player playback row and Media Details retain the full recovery trace diagnostics introduced
  through `092a03a`.
- `DP`, `DS`, and `TC` denote Direct Play, Direct Stream, and transcode. Existing `REOPEN[...]`,
  `FALLBACK[...]`, and `ASSERR[...]` tokens are preserved; `RETRY[...]` now identifies a bounded rebuild
  that deliberately keeps the current Direct Play delivery.
- Expected sticky examples include `DP > REOPEN[seek] > DP > RETRY[seek-mismatch] > DP` and
  `DP > REOPEN[buffer-repair] > DP`.
- A Direct Play -> Direct Stream transition during automatic recovery is now expected only after confirmed
  compatibility evidence and is explicitly represented by the existing `FALLBACK[...]` trace path. A bare
  terminal-window `DP > DS` is no longer an intentional generic recovery path.

## Current ASS renderer architecture (post-sync12 warm/lookahead checkpoint)

The local external ASS/SSA path is optimized for LG webOS / Chrome 53 while keeping a
single libass worker.

- The legacy asm.js worker is generated from `scripts/slim-ass-legacy-worker.js`.
- The existing `ASS_Library` / `ASS_Renderer` are preserved while replacing the real ASS
  track, avoiding library/renderer recreation.
- Runtime font selection keeps Fontconfig bypassed (`ASS_FONTPROVIDER_NONE`) and uses the
  packaged fallback font path.
- When global ASS rendering is enabled, startup creates/initializes one worker and the first Home-ready
  surface schedules one deferred synthetic Dialogue render to warm the glyph/raster path. When global
  ASS rendering is disabled, startup worker preload, pool prewarm, Home warmup and speculative ASS
  prefetch are skipped.
- Static ASS is event/boundary-driven. Animated/karaoke/effect ASS remains on the conservative
  24 fps path.
- Playback normally uses a monotonic presentation barrier. Small backwards clock jitter cannot
  reopen an already-consumed ASS boundary.
- Explicit seek/discontinuity starts a new `playbackEpoch`, invalidating the monotonic barrier
  and any prepared frames so legitimate backwards seeking remains valid.
- The bitmap from the last **actually presented static ASS state** is tracked separately with only
  its `[validFrom, validUntil)` metadata. A committed seek inside that same state keeps the bitmap
  visible; a seek before `validFrom` or at/after `validUntil` clears it immediately so an old
  subtitle cannot remain stuck until the next boundary. Pending/unpresented `renderFramesData` is
  never used for this decision.
- Pixel-affecting changes use a separate `renderGeneration`, invalidating prepared buffers
  without pretending the media timeline changed.
- A deliberate ASS offset edit is treated as a timeline discontinuity at the newly shifted ASS
  clock, so backwards user corrections reset the monotonic barrier and invalidate old prepared
  states just like an explicit seek.

### Prepared lookahead queue

Static ASS uses a real-track prepared-frame queue:

- semantic unit: complete static libass boundary state, not a Dialogue line;
- maximum costly depth: 5 future states with retained RGBA payload;
- retained prepared-buffer budget: 16 MiB;
- quota: at most 5 prepared states with RGBA bytes; zero-byte/empty states remain queued and do not
  consume those five costly slots, so total prepared depth may legitimately exceed 5;
- prepared RGBA `ArrayBuffer`s are transferred to and retained by the main thread, independent
  of libass-owned `ASS_Image` memory;
- empty states and overlapping Dialogue compositions are valid queue entries;
- `future-window` frames are retained and presented at `validFrom`, not rejected;
- expired, old-epoch, old-generation, backwards-time, or backwards-boundary frames are dropped;
- a prepared RAF verifies that its exact queue object is still retained before drawing, so a
  superseding real frame cannot be overwritten by a stale prepared callback;
- worker speculative rendering never advances the committed playback boundary;
- latest-wins recovery skips already-expired states after a long blocking libass render;
- lookahead attempts are bounded per current boundary position: a frame evicted by the RAM
  budget may be retried after playback advances, but cannot cause a tight retry loop at the
  same position;
- a full five-costly-entry main-thread queue prevents the worker from starting an unnecessary sixth
  memory-bearing speculative libass render until a costly slot is acknowledged free;
- removing a prepared copy because a live frame supersedes it updates worker occupancy immediately,
  without waiting for that live frame's RAF;
- `null` committed-boundary state remains semantically "nothing presented" and is never coerced to
  boundary zero;
- near-boundary timer wakeups inside the one-millisecond anti-jitter tolerance are re-armed rather
  than falling through until the next playback clock sample.

The prepared-frame media clock is playback-rate aware on both sides of the protocol. A rate change
re-anchors the main-thread and worker clocks at the exact change timestamp before applying the new
rate, preventing the new rate from being retroactively applied to elapsed time under the old rate.

## Library watched/filter hardening after sync10

A post-sync10 application audit hardened Library state reconciliation without changing the ASS
renderer architecture.

- The catalog query already preserved combined server-side controls such as
  `sort=audienceRating:desc` plus `unwatched=1`; the reported contradictory card was not caused by
  dropping either query parameter.
- Show/season card and Detail watched state now follows hierarchical Plex completion: a show or
  season is watched only when `viewedLeafCount >= leafCount`. A positive aggregate `viewCount` no
  longer marks a partially watched hierarchy as fully watched.
- Watched/content/progress mutations invalidate detached Library caches and any in-flight Library
  page or container-summary request that was created against pre-mutation Plex state.
- Returning from Detail/Player keeps the resident grid visible. For the regular catalog, Library
  captures the focused Plex `ratingKey`, numeric UI index, absolute raw Plex source offset, containing
  60-item raw block, and query identity before leaving the surface. If content becomes dirty while
  hidden and the same catalog query is still active, recovery requests only that one 60-item Plex
  window instead of replaying the complete resident prefix from offset zero. The refreshed block is
  merged by raw source-offset range with stable-identity de-duplication; focus follows the same
  `ratingKey` if it still exists, otherwise it falls back to the prior numeric UI index.
- The Unwatched catalog now applies a final local semantic guard to the metadata Plex already returned.
  Canonically watched rows are excluded even when Plex incorrectly includes them under `unwatched=1`;
  for show/season rows this includes `leafCount > 0 && viewedLeafCount >= leafCount`. This adds no
  network request. Raw Plex `nextStart` remains separate from the shorter visible list, intermediate
  pages rejected in full are skipped automatically, and terminal visible totals collapse exactly.
- The bounded catalog merge keeps pagination in raw Plex coordinates, retaining the furthest consumed
  raw continuation offset even when local filtering changes visible indexes. A changed query,
  non-catalog surface (Recommended/Continue/Recent), or unsupported context falls back to the existing
  authoritative replacement path. Dirty state is cleared only after a successful page/recommendation
  render or successful container-summary refresh; failed bounded refreshes retain their anchor and retry.
- In an active catalog filtered to Watched/Unwatched, an exact item that is explicitly changed to
  the opposite membership is removed locally immediately, then still verified by the authoritative
  Plex replacement.
- Incremental pagination is blocked while membership is dirty so old offsets cannot skip an item
  after the filtered dataset shrinks or changes.
- Playback progress invalidates cached Continue availability; Continue is re-probed once the
  Library is visible again, avoiding stale optional-tab visibility after starting/resuming media.
- Detail episode progress bars represent the current partial playback position independently from
  historical completion. Plex may legitimately return `viewed=true` together with a new partial
  `viewOffset`/`progress` during a rewatch; episode cards therefore show the progress bar for
  `0 < progress < 100` even when the watched marker remains present, and hide it only at 0%/100%.
- Hidden Library responses release their loading lock even when they are not eligible to render,
  while generation checks prevent stale callbacks from applying later.

The local external ASS/SSA sync10 implementation itself was not modified by this audit.

### Cold libass render

TV diagnostics before prepared lookahead showed first real glyph-bearing `ass_render_frame()` calls taking
roughly 7-9 seconds on a cold renderer. The current design does not hide this with synthetic
text; instead it attempts to pay that cost against the next *real* static ASS boundary early,
so the actual track/font/style/glyph/layout work can be cached for presentation.

This still cannot guarantee zero startup delay when playback begins inside an already-active
subtitle or when the first required real state is closer than the cold render duration.

### Sync10 edge-case hardening

The sync10 pass was an adversarial review of the prepared queue rather than a new rendering model.
It closed six reproducible edge cases while keeping the sync9 architecture intact:

- a prepared timer waking less than one millisecond before `validFrom` now re-arms instead of
  waiting for the next coarse playback clock sample;
- playback-rate changes re-anchor the worker clock at the exact old-rate position before applying
  the new rate, matching the main-thread prepared clock;
- a full five-costly-entry acknowledged queue cannot trigger an unnecessary sixth memory-bearing
  speculative render;
- `committedBoundaryIndex: null` remains "nothing presented" instead of coercing to boundary zero;
- a live frame that supersedes a prepared copy reports the freed queue slot immediately to the
  worker rather than waiting for RAF presentation;
- a user-driven ASS offset change opens a new playback epoch at the shifted ASS clock so intentional
  backwards synchronization changes are never mistaken for clock jitter.

## Diagnostics

ASS synchronization telemetry is bounded/privacy-safe and includes the rolling trace plus
prepared-queue information. Useful fields/events include:

- `frameSeq`, `frameFingerprint`, `renderReason`;
- `mediaTime`, `expectedTime`, `boundaryIndex`, `validFrom`, `validUntil`;
- `playbackEpoch`, `renderGeneration`;
- `prepared`, `preparedDepth`, `preparedCostlyDepth`, `preparedBytes`, `workerPreparedDepth`,
  `workerPreparedCostlyDepth`;
- `lookaheadStarted`, `lookaheadCompleted`, `leadMs`, `recentRenderMs`;
- `prepared-frame`, `prepared-presented`, `prepared-dropped`, `prepared-invalidated`;
- `frame-rejected` with rejection reason.

The next TV validation should specifically check:

1. cold start -> first external static ASS without touching the timeline;
2. no end-of-subtitle flash/reappearance;
3. prepared queue filling and hit rate;
4. first real libass render cost vs visible frame lag;
5. explicit backwards seek, confirming `playbackEpoch` invalidation;
6. playback-rate changes (for example 1x -> 2x -> 1x), confirming prepared presentation stays aligned.

## Historical verification status (pre-maintenance checkpoint)

Fresh checks on the final source tree completed successfully for:

- generated app bundle freshness;
- generated stylesheet freshness/theme contracts;
- generated legacy ASS worker freshness;
- release metadata;
- coordinator syntax/architecture;
- maintainability boundaries;
- feature contracts;
- performance budgets;
- Chrome 53 / ECMAScript 5 parsing (165 runtime files);
- shell/subtitle renderer assets;
- LG UX static contracts;
- focused ASS lookahead/prepared-frame tests;
- full unit suite;
- baseline suite;
- pre-release memory lifecycle suite;
- `typecheck:contracts`;
- `git diff --check` and `git fsck --no-dangling` completed successfully immediately before commit.

Current measured performance budgets at this checkpoint are approximately:

- runtime JS: 864012 / 900000 bytes raw;
- runtime JS gzip: 169821 / 190000 bytes;
- startup JS: 2142816 / 2200000 bytes.

The pre-release memory run retained 0/200 payloads and 0/100 runtime payloads, with about
+0.09 MiB net heap growth and 0.01 MiB/sample slope in the latest run.

Using the supplied Linux x64 dependency tree generated from this repository's lockfile,
`npm run verify` passes end-to-end, including ESLint, `typecheck:contracts`, the complete
`jsconfig.json` typecheck, the 207-file unit suite, baseline, shell/subtitle assets and LG UX
checks. The earlier broad-typecheck caveat came from the older globally available TypeScript
5.8.3 toolchain rather than from the application source.

The archive may still omit expanded `node_modules`; when that is the case, use the retained
offline dependency package in `handoff-resources/` or run `npm ci` from the lockfile before
invoking `npm run verify` on a new machine.

## Archive continuation

Start here after extraction:

```sh
git status --short --branch
git log -1 --oneline
node --version
npm --version
```

Then read, in order:

- `AGENTS.md`
- `docs/playback-invariants.md`
- `docs/ass-local-renderer.md`
- `docs/testing.md`

Do not edit generated `app/app.js`, `app/player.js`, or `app/styles.css` directly. Make source changes and
rebuild them with the repository scripts.

## ASS sync11 live-clock null-override fix (2026-08-31)

A physical-TV sync10 run exposed a total loss of local ASS frames after a successful real-track
replacement. The diagnostic had a healthy playing video, initialized worker, successful ASS fetch and
`setTrack`, and hundreds of `renderer`/`worker-send` clock samples, but `firstRealAssFrame` remained
null and no `worker-frame`/`raf-presented` stages appeared.

Root cause was introduced by sync9 prepared lookahead. Normal renders intentionally store
`PloffAssRenderOverrideTime = null`, but the render hot path tested it with
`isFinite(Number(PloffAssRenderOverrideTime))`. JavaScript coerces `Number(null)` to `0`, so every
ordinary render used media time zero instead of `getCurrentTime() + delay`. Existing real-worker tests
missed it because their replacement ASS had an active Dialogue at 0:00; a mid-episode track starting
at 15:00 reproduces the TV failure exactly.

The worker now treats `null`/`undefined` as "no override" before numeric conversion. Numeric overrides,
including zero, remain valid for deliberate speculative renders. A real asm.js regression loads a
replacement track beginning at 15:00, drives playback at 15:01, and requires the returned frame's
`mediaTime` to match the live clock. The test failed by timeout before the fix and passes after it.

With the supplied offline Linux x64 dependency tree, the complete `npm run verify` pipeline now passes,
including ESLint, both TypeScript configurations, all 207 unit files (including the real legacy asm.js
worker profile), baseline, assets and LG UX checks. The earlier broad-TypeScript caveat was an artifact
of the older global TypeScript toolchain; the lockfile dependency tree passes both typecheck targets.
## Global local-subtitle renderer contract (2026-08-31)

- The compact Player track summary exposes a runtime-only local-renderer badge directly below the active subtitle. It shows `SRT / WebVTT · <localized LOCAL>` or `ASS / SSA · <localized LOCAL>` only when `PlaybackController.snapshot().subtitleRenderMode === 'local'`; remote/server ownership, Force Transcode, local-loading and subtitles-off hide it. The type comes from `localSubtitle.rendererType`, not from the global setting. The pill inherits the same typography as the adjacent Audio/Subtitles rows and uses 6 px of top separation without changing Player-heading/control geometry. Subtitle sizing keeps the existing 75/100/125/150% steps and adds 175/200%; the persisted Settings schema is the authority used by the Player and advanced editor, and renderer/style clamps already accept values through 200%.
- `subtitleRenderingSrt` and `subtitleRenderingAss` are global settings only. Media/season
  `renderSrt`/`renderAss` values are no longer resolved or persisted; legacy scoped values are ignored.
- Advanced Subtitle Settings still shows both renderer rows, but they act as global controls. Every
  ON/OFF request opens the existing remote-safe choice dialog as a two-choice confirmation. The safe
  initial selection is No; Back closes without applying and focus returns to the editor row.
- Confirming a renderer change commits the global setting immediately and reconciles the current
  playback/editor ownership. Cancelling the editor later can revert track/offset/style draft changes,
  but it must not undo a previously confirmed global renderer change.
- Force Transcode remains authoritative: a global local-renderer setting never converts a burn-in
  transcode session into local subtitle ownership.
- With global ASS rendering OFF, document-head worker startup, pool prewarm, Home glyph warmup and
  speculative ASS prefetch/preparation are all gated off. Turning it OFF also cancels pending
  speculative work; an `ass_render_frame()` already executing synchronously cannot be preempted.

## ASS post-sync11 Home warmup + free-state lookahead (2026-08-31)

Physical-TV runs from the correctly integrated `7ffa5b2` tree proved the renderer and prepared queue
were healthy, but the first real glyph-bearing libass render still cost about 6.9-7.1 seconds. Later
renders fell to hundreds and then tens of milliseconds. The remaining cold cost was therefore moved
into a bounded one-shot startup warmup rather than changing clock, track replacement, or presentation.

Current contract:

- the legacy worker is still created once from the document head; no second worker is introduced;
- the bootstrap ASS contains one short synthetic Dialogue but is not rendered during initial worker
  creation;
- after the first Home-ready callback, one deferred glyph-bearing warm step renders inside that
  Dialogue and completes the warmup; the former empty-state second step was removed after physical-TV
  measurement showed it cost only ~13 ms and did not reduce the first real-track render;
- if Player/Detail claims the worker before or during warmup, playback ownership wins and no additional
  synthetic step is queued;
- worker URL cache-buster is `assSync=12`;
- prepared lookahead keeps at most five memory-bearing RGBA states plus any number of zero-byte
  boundary states, subject to the existing 16 MiB RGBA budget;
- the worker receives all prepared boundary indices plus a separate costly-boundary list and scans
  through free states until five costly states are retained or the track ends;
- diagnostics expose both total and costly prepared depth.

Required physical-TV validation for this checkpoint:

1. cold app launch; wait on Home long enough for warmup to finish;
2. confirm preloader `warmStepCount=1`, `warmComplete=true`, non-null `warmFirstFrame`, and the expected
   large cold cost in `warmMaxMs`/`warmTotalMs`;
3. start an external static ASS and compare `realAssSetTrackReady -> firstRealAssFrame` with the prior
   ~7.4-7.7 s gap; the first real render should no longer pay the same cold glyph cost when Home warmup
   completed;
4. verify traces can show `preparedDepth > 5` while `preparedCostlyDepth <= 5`,
   `workerPreparedCostlyDepth <= 5`, and `preparedBytes <= 16 MiB`;
5. repeat with immediate playback before Home warmup completes: playback must remain correct, use only
   one worker, and may legitimately pay the cold render itself if it won the ownership race.

Do not change sync/epoch/generation rules to optimize this checkpoint. The first question is whether
the measured cold libass work moved into Home time without harming navigation or immediate playback.

## Latest checkpoint - 2026-08-31

Code commit `fad5192b279348f07a05e7fb54984fada37f49e2` fixes global ASS/SRT renderer transitions in the live Player. Renderer toggles now fresh-replan playback instead of reusing a stale PlaybackRecovery/offsetBase, preserving the absolute return position and restoring backward seek across source-mode changes. Global ASS/SRT flags are backed up, mutable in-place ASS disable detection is hardened, and pooled ASS leases suspend/pause/invalidate hidden lookahead without destroying the warm worker. Full verify + memory + ASS benchmark + Git integrity passed. No push.

## v1.0.7 release-candidate preparation (2026-09-01)

- Release metadata was bumped coherently to `1.0.7` in `package.json`, `package-lock.json`, and `webos-shell-app/appinfo.json`; no tag has been created yet.
- `CHANGELOG.md` now contains the dated `1.0.7` section while a fresh empty `[Unreleased]` remains above it.
- Current Settings/features/scoped-subtitle documentation now states that `subtitleRenderingSrt` and `subtitleRenderingAss` are global-only; media/season scopes retain track/style/timing only.
- The physical-TV matrix item 7 explicitly covers renderer global confirmations, local/server ownership transitions, backward seek after a source-mode change, the runtime LOCAL badge, static ASS seek retention/clear against the exact presented validity window, and at least one animated/karaoke ASS segment. Item 4 now also covers contextual watched/progress actions for untouched/partial/completed media and a real clear-progress round-trip. The current normalized matrix digest is `d5c8a2fd71f4e2ec9616a9117547609adc9744b3003cc770909de537cc043734`.
- `docs/release-signoff/v1.0.7.md` is intentionally a tracked **PENDING** draft. Do not mark it PASS or create/tag `v1.0.7` until that exact candidate has completed the physical-TV matrix, especially the karaoke ASS coverage.
- Fresh gate after the static seek-window fix and matrix update: `npm run test:pre-release` PASS;
  memory retained `0/200` payloads and `0/100` runtime payloads with `0.08 MiB` net heap growth.

### Post-RC static ASS seek-window fix

A physical-TV edge case found after the initial RC preparation showed that a subtitle bitmap already
on the canvas could survive a committed forward or backward seek until the next ASS boundary. Epoch,
prepared-queue and RAF invalidation were already correct; the missing piece was immediate treatment of
the pixels that had already been presented.

The main-thread wrapper now remembers only lightweight validity metadata for the last static frame that
was actually drawn. On a committed seek it still opens a new `playbackEpoch`, invalidates prepared work
and resets the monotonic barrier, but it clears the existing canvas only when the new ASS time falls
outside the exact `[validFrom, validUntil)` window. Multiple seeks inside the same window therefore do
not blink the subtitle; backward seeks before `validFrom` and forward seeks at/after the exclusive
`validUntil` clear it immediately. Animated/karaoke rendering remains on the independent continuous
path and was not redesigned for this fix.

## Post-RC media watched/progress action hardening (2026-09-01)

A physical-TV check found that the card-level **Clear progress** action did not actually remove the
Plex resume point. The prior client used `/:/progress` with `time=0`; current Python-PlexAPI explicitly
notes that zero does not update/reset progress, while the Plex progress protocol has historically used
`-1` as the beginning/no-resume sentinel. `PlexClient.resetProgress()` now sends a stopped progress
update with `time=-1`; ordinary non-reset progress values remain clamped to non-negative milliseconds.
This keeps clear-progress distinct from watched/unwatched mutations rather than abusing `unscrobble`.

Media action visibility is now state-sensitive for movies/episodes:

- untouched/unwatched: **Mark watched**;
- partial (`viewOffset > 0` or progress metadata > 0): **Mark watched**, **Mark unwatched**,
  **Clear progress**, and **Play from beginning**;
- completed without a resume point: **Mark unwatched**;
- **Remove from Continue Watching** remains unchanged and is offered only when the target is actually
  owned by that surface.

On a partially watched Detail, the first entry in the `...` media-options menu is the watched action complementary to the visible main Detail button. If Plex reports `viewed=true` while a resume point still exists, the visible button is **Mark unwatched** and the menu starts with **Mark watched**; if `viewed=false` with progress, the visible button is **Mark watched** and the menu starts with **Mark unwatched**. Both paths reuse `setWatchedAndReset(...)`, so applying either explicit terminal-state action clears the resume point.
Physical-TV release matrix item 4 was expanded to cover the three media states, the reset round-trip,
partial Detail option ordering, and Continue Watching origin gating. The regenerated normalized matrix
digest is `d5c8a2fd71f4e2ec9616a9117547609adc9744b3003cc770909de537cc043734`; the exact matrix must be rerun before release PASS.

Fresh gate after the media watched/progress hardening: `npm run test:pre-release` PASS on the
final code/test state; memory retained `0/200` payloads and `0/100` runtime payloads, with `0.02 MiB`
net heap growth. The physical release signoff remains PENDING because the real Plex clear-progress
round-trip and the rest of the TV matrix have not yet been revalidated on the exact candidate.

## Chapter fallback and episode duration previews (2026-09-01)

This checkpoint, based on `8ee546a`, adds two small Player/Detail presentation hardenings:

- chapter cards now render the image inside a `chapter-card-image-frame` whose neutral surface uses
  `var(--control-surface)` at 70% opacity. The actual `<img>` is transparent until the shared progressive loader marks it
  `is-loaded`; therefore a missing Plex `thumb` or preview/final load failure cannot expose the webOS/browser
  broken-image glyph, while successful previews fade in normally. No fallback asset or extra request was added.
- episode previews in Detail and in the Player queue show a lower-left duration badge. Formatting is `MM:SS`
  below one hour and `H:MM:SS` at/above one hour, with an unpadded hour and padded minutes/seconds. Missing,
  invalid, or non-positive duration is explicit as `--:--`. The existing watched marker stays in its established
  bottom-right position; queue duration is shown only for episode items.

Focused regressions cover missing chapter artwork, duration formatting, queue presentation, and static TV-shell
CSS contracts. The physical release matrix was expanded for Detail episode cards, Player queue duration badges,
and chapter missing/failed-thumbnail fallback; the v1.0.7 signoff must remain PENDING until that exact matrix is
rerun on the TV.

## Partial Detail watched-action correction and chapter placeholder opacity (2026-09-01)

A physical-TV check after the episode-duration/chapter-fallback checkpoint exposed an important Plex state combination: an episode can still have a positive resume point while Plex reports `viewed=true`. In that state the primary Detail button correctly shows **Mark unwatched**, but the previous partial-media options logic only recognized `!viewed && progress`, so the `...` menu exposed no complementary **Mark watched** action.

The Detail options rule is now based on resume/progress presence independently from `viewed`. When progress exists, the first `...` entry is always the watched action complementary to the primary Detail button:

- `viewed=false` + progress -> primary **Mark watched**, options start with **Mark unwatched**;
- `viewed=true` + progress -> primary **Mark unwatched**, options start with **Mark watched**.

Both explicit options go through the existing `setWatchedAndReset(...)` mutation and therefore clear the stale resume point while setting the requested terminal watched state. No-progress Detail behavior is unchanged.

The neutral chapter fallback was also refined visually: the placeholder is now a dedicated `:before` surface using `var(--control-surface)` at 70% opacity. The actual progressive image remains above that layer and reaches full opacity only after `is-loaded`, so valid artwork is never dimmed while missing/failed chapter artwork stays intentionally subdued.

Regression coverage now includes the `viewed=true` + partial-resume Detail case and the 70%-opacity placeholder CSS contract. Physical-TV matrix items 4 and 10 were updated; the current normalized matrix digest is `d5c8a2fd71f4e2ec9616a9117547609adc9744b3003cc770909de537cc043734`. The v1.0.7 signoff remains PENDING until the exact candidate is rechecked on the TV.

## Detail episode artwork height correction (2026-09-01)

The Detail episode strip previously used a 124 px artwork height plus a 44 px caption inside a 168 px card. Because the card width is about 310 px at the reference TV layout, `object-fit: cover` cropped substantially more vertical artwork than intended. The Detail episode artwork is now 168 px tall while the caption remains a separate 44 px row below it, making the full card 212 px high.

The strip remains anchored at `bottom: 4%` but grows from 186 px to 230 px. That preserves the previous lower edge while moving the strip's upper edge up by exactly 44 px, so the taller artwork does not push the row farther down the screen. The lower-left duration badge starts at `top: 134px`, leaving exactly 6 px between the badge bottom and the 168 px artwork edge. Progressive-image sizing was updated to use 168 px as the Detail episode fallback height so pre-layout image requests stay aligned with the new geometry.

A follow-up physical-TV layout review moved the 6 px episode progress track from the final 6 px of the artwork to `top: 168px`, immediately below the image. It therefore consumes the first 6 px of the existing 44 px caption area rather than reducing artwork height or crowding the duration badge. Card height remains 212 px, the caption row remains 44 px in layout, and the useful caption area is effectively 38 px below the progress bar.

Focused regressions assert the 168 px rendered artwork request, the 230 px bottom-anchored strip, 212 px card, 168 px image, 6 px duration spacing, and progress-track placement below the artwork. The physical-TV release matrix now explicitly requires verifying that the title remains below the artwork, the row moves upward rather than downward, the duration badge spacing matches the new layout, and the progress bar occupies caption space instead of artwork space.


## Subtitle scaling through 200% and compact renderer pill typography (2026-09-01)

The subtitle-size domain remains backward-compatible and keeps the existing `75%`, `100%`, `125%`, and `150%` steps, adding only `175%` and `200%`. `app/settings-schema.js` is the single runtime authority for the full `[75, 100, 125, 150, 175, 200]` list; Settings, Player choices, and the advanced subtitle editor consume that domain rather than carrying separate copies. Existing renderer/style normalization already clamps safely through 200%, so no storage migration or renderer-protocol change is required.

The runtime-only `ASS / SSA · LOCAL` / `SRT / WebVTT · LOCAL` pill keeps its existing border, padding, and geometry but now inherits the font size and line-height of the adjacent Audio/Subtitles summary and uses normal weight. This makes the pill visually subordinate to the track text without changing ownership semantics or labels.

Physical-TV matrix item 7 now requires cycling through the full subtitle-size domain, rendering and restoring 200% for local SRT/WebVTT and ASS/SSA, and confirming the local-renderer pill matches the summary-row typography. The normalized matrix digest is `d5c8a2fd71f4e2ec9616a9117547609adc9744b3003cc770909de537cc043734`; the v1.0.7 signoff remains PENDING.

## Full-application failure-path audit hardening (2026-09-01)

A post-RC audit after the `25646f9` checkpoint found six independent edge cases that were not
covered by the otherwise-green pre-release gate. Each was reproduced with a focused failing test
before the production fix, then exercised again together through the complete unit suite.

- `setWatchedAndReset()` now reports whether the watched mutation was already accepted when the
  subsequent resume reset fails. Detail and contextual-card owners reconcile the accepted watched
  state, preserve the still-authoritative resume/progress value, and keep the error visible rather
  than leaving Plex and the UI silently divergent. Season bulk updates likewise publish a watched
  transition when that first step succeeded while still counting the item as a partial failure.
- `loadPlayback()` no longer publishes a ready playback object if the initial Plex stream-selection
  PUT fails; the error remains on the normal load/recovery path instead of starting with stale audio
  or subtitle ownership.
- `PlaybackTimeline.report()` keeps its synchronous return contract (a report attempt was started)
  but its asynchronous callback now marks a checkpoint reported only when Plex accepted the timeline
  write. Local progress reconciliation therefore cannot treat a failed network write as persisted.
- `refreshLibrary()`, `refreshLibraryMetadata()`, and `refreshMetadata()` now return their existing
  XHR/request handles, so feature owners can actually abort refresh work on navigation/teardown.
- Sub-hour episode durations use the agreed zero-padded `MM:SS` form; hour-bearing values remain
  `H:MM:SS` with an unpadded hour, and missing/non-positive values remain `--:--`.
- A first settings-backup save that creates the technical Plex playlist but then fails to update its
  summary now removes only that newly-created playlist before returning the original error. Existing
  backup playlists are never deleted by this cleanup path, preventing orphan multiplication on retry.

These changes do not redesign normal success paths. They harden failure reporting, reconciliation,
request ownership and cleanup around the existing Plex contracts. The physical release signoff remains
PENDING for the exact final RC. The normalized physical-TV matrix digest is
`d5c8a2fd71f4e2ec9616a9117547609adc9744b3003cc770909de537cc043734`.

## Buffering clock hardening for shared timeline and local subtitles (2026-09-02)

A rare physical-TV incident showed the progress bar and local ASS remaining on the same wrong clock
through pause/resume and several seeks. The ASS renderer itself was not the likely independent source:
it receives `PlaybackController`'s public time, so a poisoned controller clock naturally moves the bar
and ASS together. Audit reproduced two uncovered failure families: an arbitrary forward native jump was
accepted immediately, and `waiting`/`stalled` did not freeze the public clock until the spinner appeared
500 ms later. Offset HLS could be especially damaging if webOS temporarily exposed absolute rather than
stream-relative `currentTime`, because the old formula would add `offsetBase` a second time.

The hardened design leaves ASS scheduling/rendering unchanged and strengthens the shared playback clock:

- the first `waiting`/`stalled` event captures a defensive checkpoint containing confirmed absolute time,
  raw native time, and `offsetBase`, then freezes both `PlaybackTimeline` and the local ASS clock immediately;
  the existing 500 ms grace remains visual-only for the spinner;
- `canplay` marks source readiness but cannot release an unresolved checkpoint. After a manual pause during
  buffering, a high-readiness `timeupdate` can also validate and restore playing state if webOS resumes native
  progression without emitting the expected second `playing` event;
- `playing` or the buffering watchdog assesses the current native sample through the pure
  `PlaybackClock.assessBufferResume()` contract. The offset must remain stable; nullable/non-finite time is
  rejected; rollback beyond 2 s, forward movement beyond 5 s, and offset-HLS native-domain flips are rejected;
- the first rejected sample receives a bounded 400 ms settlement window. A plausible second sample is adopted
  atomically as the shared video/UI/ASS clock without source replacement. A persistent impossible sample consumes
  one repair allowance, opens a new local-ASS epoch at the normalized recovery target, and rebuilds at the original
  confirmed absolute checkpoint so prepared state from the rejected source cannot survive;
- repair allowance is owned by `PlaybackSession` per explicit discontinuity. A later independent buffering event
  or committed seek re-arms one repair, while repeated bad samples within one incident cannot loop rebuilds;
- pause preserves the checkpoint; a committed seek supersedes it and makes the requested absolute target
  authoritative. If an accepted post-buffer sample is a small decoder rollback, local ASS opens a new playback
  epoch before the shared clock adopts it, so the static monotonic barrier cannot remain ahead of the video;
  end, terminal pause, native error, source replacement, close, and destroy retire timers so late callbacks cannot
  alter a superseded playback;
- `PlayerBufferingIndicator` reports native advancement separately from spinner visibility, covering webOS builds
  that omit a second `playing` event after a short stall. A playing `timeupdate` observed below native
  `HAVE_FUTURE_DATA` also opens the defensive checkpoint before reading that sample, covering delayed or missing
  `waiting`/`stalled` notification ordering;
- diagnostics retain the raw native clock, derived native-plus-offset value, original buffer checkpoint, final and
  initial recovery reason, delta/candidate/target, acceptance, and cumulative repair count. The feature and support
  report cross two explicit allowlists; no source URL, Plex token, subtitle text, or raw session object is exported.

Regression coverage includes short grace-period recovery without `playing`, pause/resume recovery from high-readiness
`timeupdate` when `playing` is missing, low-readiness clock freeze before a missing/delayed `waiting`, long buffering,
transient and persistent forward poisoning, backward tolerance with ASS epoch reset, non-zero-offset domain flip,
two independent repairs in one episode, pause during buffering, explicit seek supersession, native-seek `waiting`,
local ASS parity, terminal/error cleanup,
and post-recovery diagnostics that retain the originating checkpoint. Physical-TV signoff remains PENDING and the
exact candidate must complete the expanded buffering drill in `docs/testing.md`. The normalized physical-TV matrix
digest for that drill is `d5c8a2fd71f4e2ec9616a9117547609adc9744b3003cc770909de537cc043734`.

## Capability-gated Advanced Subtitle Settings for embedded ASS/SSA (2026-09-03)

Embedded ASS/SSA may now enter Advanced Subtitle Settings. This deliberately separates editor
availability from original-document fidelity: Plex may expose a converted/lossy embedded ASS payload,
so Ploff uses it only for playback preview and does not claim to edit the source document or override
ASS/libass styles.

`SubtitleSync.editorCapabilities()` is the canonical capability matrix. A supported selected track
keeps Track, Offset, Loop and Timeline available. Size requires actual local renderer ownership.
Background and Edge require locally rendered SRT/WebVTT and remain disabled for all ASS/SSA. Renderer
rows remain visible, but are enabled only when the media contains the corresponding family. The dedicated Player editor
controller skips disabled rows during D-pad navigation, rejects pointer/OK activation, moves focus to
the nearest valid row when a track/renderer change invalidates the current control, and passes the
same capability snapshot into scoped persistence.

Local embedded ASS timing is saved by server/part/stream through `SubtitleOffsetStore`. When Plex or
Force Transcode owns the pixels, the same embedded ASS offset is written through Plex's subtitle-offset
API and mirrored locally so a later local-renderer session restores it. Disabled size/style rows cannot
overwrite draft values. Apply to season removes only enabled media fields: disabled local-only ASS size
or SRT appearance remains a media exception and becomes effective again if local ownership returns.
ASS background/edge values are never treated as applicable scoped style.

Focused regressions cover embedded ASS editor availability, transient local-load retry, local ASS
size/timing, Force Transcode timing, track selection, ASS <-> SRT capability/focus changes, disabled
pointer/remote actions, Apply/Cancel/Reset/season persistence, and failure paths. Worker/libass,
prepared-frame, static/animated ASS and playback-clock internals are unchanged by this feature.
The normalized physical-TV matrix digest for this capability-gated editor candidate is
`55fb614fc13ca29c0e83c98bbfaac689da1f7f01b3cebdc126ee1e9cf0f5094f`; the v1.0.7 signoff remains PENDING.


## Opt-in unbounded desync capture (2026-09-03)

After a physical-TV Direct Stream buffering incident left external local ASS far ahead of the visible
video, the retained ~60-second ASS ring showed that libass itself was presenting the clock Ploff asked
for, but the decisive `waiting -> recovery -> source replacement -> decoder resume` sequence had already
fallen out of the ring. A dedicated manual capture was therefore added before attempting another clock
fix.

`app/debug-capture.js` exposes `PloffDebugCapture`. It is inactive by default, so ordinary Ploff use
retains no continuous raw playback/ASS event history. A debugger must explicitly call `start()`; that
begins a fresh unbounded capture with no 60-second or 1024-entry eviction. `mark(label)`, `status()`,
`export()` and `stop()` support a Web Inspector/Codex reproduction workflow. The capture is deliberately
privacy filtered and excludes raw source URLs, tokens and subtitle text.

`PlaybackController` contributes source/buffer/recovery generations, native media events, buffer
checkpoints and recovery samples, indicator grace/watchdog callbacks, seeks, rebuild/source preparation
and source application with `offsetBase`. Existing ASS sync telemetry is bridged into the same collector
only while it is active, including prepared/presented frames, playback epoch and render generation.
`PloffAssSubtitleColdStartMetrics.syncTrace()` now returns no raw trace during ordinary playback and,
while manual capture is active, reflects the unbounded ASS portion of the same capture. No buffering or
clock recovery behavior was intentionally changed in this diagnostic commit; the next physical-TV
reproduction should be captured before implementing the final Direct Stream recovery fix.

## Direct Play recovery trace diagnostic (2026-09-06)

The physical LG still reproduced the desync and showed `Flusso diretto` after the post-end seek.
To distinguish the exact transition without requiring Web Inspector, the Player information panel now
appends a compact recovery trace to the playback mode, for example
`DP > REOPEN[seek] > DP > FALLBACK[recover:prepare] > DS`. `DP`, `DS`, and `TC` mean Direct Play,
Direct Stream, and transcode. `REOPEN[...]` records the guarded internal cold reopen reason;
`FALLBACK[...]` distinguishes a second rebuild from an automatic recovery failure such as `prepare`,
`native`, `clock`, `buffer-repair`, or seek verification. The same reasons are emitted through the
existing opt-in debug capture. This checkpoint intentionally changes diagnostics only, not playback
selection/recovery behavior.

## ASS runtime-error recovery trace diagnostic (2026-09-06)

The first physical-TV run with the compact recovery trace reproduced the post-end seek desync and showed
`DP > DS`, with no `REOPEN[...]` or `FALLBACK[...]` token. That rules out the instrumented seek-rebuild
and recovery wrappers for that observed Direct Play -> Direct Stream transition. One remaining automatic
path can re-plan playback directly: a late local ASS renderer runtime error handled by
`handleAssRuntimeError()`.

This checkpoint adds diagnostics only. When a non-editor local ASS renderer reports a runtime failure,
the recovery trace now records `ASSERR[<message>]` immediately before the existing renderer teardown and
Plex re-plan. The message is whitespace-normalized, `]` is escaped as `)`, and output is capped at 64
characters so the Player information panel remains readable. The existing fallback behavior is unchanged.
A confirming physical trace would therefore look like `DP > ASSERR[...] > DS` (or `TC`, depending on the
available recovery plan). If the next TV reproduction remains `DP > DS` with no `ASSERR`, this hypothesis
is falsified and another direct re-plan path must be instrumented instead.

## Sticky Direct Play recovery implementation (2026-09-06)

Investigation from checkpoint `092a03a` identified the generic downgrade source in
`PlaybackRecovery.rebuild()`: a rebuild on a current Direct Play step incremented the recovery-plan index,
so unrelated transport/timing events could select Direct Stream without any new compatibility evidence.
`PlaybackRecovery.rebuild()` now preserves the current strategy. `PlaybackController` distinguishes a
same-delivery retry from a true compatibility fallback: rebuild paths stay on Direct Play and emit
`RETRY[...]` when the cold-reopen guard is already active, while unclassified Direct Play native/prepare
errors stop bounded recovery on Direct Play. Confirmed codec/decoder/format/container failures continue
through the existing fallback plan and may select Direct Stream/transcode.

Automated regression coverage now locks sticky Direct Play across terminal-window seeks, DP-capable
subtitle stream switching, clock repair, buffer repair, seek timeout and seek mismatch while the reopen
guard is active. Separate coverage proves that a confirmed Direct Play compatibility failure can still
select Direct Stream and that an already-selected offset delivery keeps terminal lookback. Existing
recovery/ASS diagnostics are preserved. Physical LG validation is still pending and must be recorded
separately before release signoff/tagging.


## Initial-startup seek autoplay and late ASS keyframe settlement (2026-09-06)

Two physical-TV edge cases remained after the `690dece` playback-intent work:

1. A seek committed during the very first source startup could leave playback paused. The native video
   element may report `paused === true` before the first stable `playing` even though autoplay is still the
   intended state. This is also possible after Ploff has already issued the native `play()` request and is
   waiting for webOS to confirm `playing`. Seek preservation now treats both the pre-source-ready startup
   window and `nativePlayPending()` as play intent; an explicit user pause still wins because it cancels the
   pending native play before a later seek captures intent.
2. On S01E02, a chapter seek to about `10:29` may initially be reported at the requested target and then
   settle to an earlier seekable keyframe around `10:23`. The public/video clock already adopted that bounded
   rollback correctly, but local ASS invalidation was only guaranteed on the `seeked` settlement shape. The
   ASS discontinuity is now owned by the common Direct Play decoder-settlement function, so the same epoch/
   prepared-frame/static-bitmap reset happens when the rollback first appears on a later `timeupdate`.

The supplied ASS confirms the relevant cue `Mentre tu assumerai il nome Alpha.` is active from 10:27.01 to
10:29.66; therefore an adopted decoded position near 10:23 must immediately invalidate that cue. Regression
coverage models this exact timing relationship without depending on the external subtitle fixture.

A later physical-TV retest corrected the first interpretation of the remaining visual defect. The problem is
not limited to rebuffering: while paused, a chapter seek can remain parked at the optimistic 10:29 target and
show its cue until Play is pressed; while already playing, a fully buffered seek can briefly expose the same
10:29 cue before webOS reveals the real ~10:23 decoded keyframe. The previous gate was too narrow because it
was armed only for play-intent restores and a no-rebuffer `timeupdate` could release it while decoder settlement
was still pending.

Local subtitle presentation is now gated for every committed seek, including paused seeks. The exact requested
target is treated as provisional and cannot reopen the overlay by itself. For a paused-origin seek, `playing`
only records that playback has actually started; the overlay remains hidden until a later decoder sample. For
an already-playing seek, the same rule prevents a target-time `timeupdate` from flashing the optimistic cue.
The gate opens when decoder settlement adopts a bounded rollback (the reproduced 10:29 -> ~10:23 case), or
when the native clock begins moving forward from the requested target and therefore proves that no immediate
rollback occurred. Rebuffer/low-readiness/rebuild resets the playing observation and still requires a fresh
stable `playing`. This keeps the existing 15-second decoder-settlement policy for clock correctness without
hiding subtitles for its full five-second forward-observation window when playback is already advancing.

## Evidence-based deep cleanup - Playback Phase 1 (2026-09-06)

The approved cleanup direction is documented in `docs/cleanup/codebase-cleanup-design.md`; the first execution plan is `docs/cleanup/playback-cleanup-phase1-plan.md`. Planning files intentionally live under `docs/cleanup/` because the repository baseline forbids `docs/superpowers/`.

Playback Phase 1 completes one evidence-backed ownership move rather than splitting the facade by line count:

- local subtitle seek-presentation state moved from `PlaybackController` to `SubtitleRuntime`;
- `PlaybackController` still decides when seek/rebuffer/playing/native-clock evidence is supplied, while `PlaybackReposition` remains the only keyframe-settlement policy owner;
- the physical-LG paused-seek and no-rebuffer 10:29 -> ~10:23 regressions remain unchanged and green;
- four pure facade aliases (`beginSubtitleSeekGate`, `markSubtitleSeekRebuffer`, `stopKeepalive`, `stopReporting`) were removed;
- no declaration-only playback private symbol or branch-level legacy path had sufficient evidence for deletion, so none was removed speculatively;
- retained LG/webOS workarounds now carry explicit ownership/why documentation.

Metrics from behavior baseline `3389735` to the Phase 1 verified state:

- `playback-controller.js`: 2966 -> 2945 lines; 144737 -> 144300 bytes;
- generated `app/app.js`: 899972 -> 899704 raw bytes; 177769 -> 177681 gzip bytes;
- full `npm run verify`: PASS;
- `npm run test:memory`: PASS, weak retention 0/200 and 0/100, net heap growth 0.03 MiB;
- `git diff --check`, performance budget and `git fsck --no-dangling`: PASS.

This is a structural refactor only. Physical LG validation remains required before release signoff. The next cleanup phase targets Player orchestration/duplication, not playback behavior.

## Evidence-based deep cleanup - Player Phase 2 (2026-09-06)

Player Phase 2 removes only duplication with owner evidence; no Player UX, focus, remote, queue, resume, subtitle-editor or playback behavior is intentionally changed.

- `queueGapVisible` was removed. The initial direct-snapshot approach was rejected because the hot-path test proved it would clone confirmation state on every facade snapshot; `QueueGapController.isOpen()` now exposes the authoritative boolean in O(1).
- `resumeChoiceVisible` was removed; nullable `resumeChoiceState` is the single source of truth for ResumeChoice visibility.
- Five pure one-use aliases were removed: `renderPlayerSettingsState`, `activeServerSnapshot`, `refreshEpisodePlaybackState`, `reconcileLibraryPlaybackProgress`, and `togglePlayback`.
- Error overlay state, subtitle/container transition timers, autoplay prefetch handles, ASS prefetch dedupe state, and queue-gap generation/source context were retained because they carry independent behavior or stale-callback/resource ownership semantics.
- Two source-contract tests were hardened after pruning so they assert the real owner/port calls rather than depending on deleted wrapper names.

Metrics from the Phase 2 baseline `7119b71` to the verified Phase 2 state:

- `player-feature-controller.js`: 2850 -> 2841 lines; 137336 -> 136675 bytes;
- generated `app/app.js`: 899704 -> 899156 raw bytes; 177681 -> 177581 gzip bytes;
- full `npm run verify`: PASS;
- `npm run test:memory`: PASS, weak retention 0/200 and 0/100, net heap growth 0.03 MiB;
- `git diff --check`, performance budget and `git fsck --no-dangling`: PASS.

Physical LG validation remains required before release signoff. The next cleanup phase targets Detail orchestration/presentation duplication while preserving the rewatch-progress behavior fixed in this cycle.

## Evidence-based deep cleanup - Detail Phase 3 (2026-09-06)

Detail Phase 3 moves local playback checkpoint ownership into `DetailController`, which already owns `currentDetail`, `selectedItem`, and `seriesContext.episodes`. The feature facade no longer carries `pendingProgress` or repeats patch loops across those three representations.

- `DetailController` records the six-second local checkpoint, uses the existing two-second Plex catch-up tolerance, protects stale season metadata, and clears the guard on expiry/new detail lifecycle.
- `DetailFeatureController` continues to own `loadSeasonEpisodes`, episode-card repaint and the one bounded delayed retry; this keeps network/presentation orchestration out of the state owner.
- Regression tests lock the 0-100 percentage scale, stale-Plex protection, server catch-up, expiry and lifecycle reset. The existing Media Details rewatch behavior remains covered.
- `detailChoiceState` and `browsingView` were the only additional pure one-use aliases removed. Extended-root cache/request keys, bulk watched guard, presentation keys, request/timer ownership and activation tokens remain because they carry independent async/presentation semantics.

Metrics for the phase: `detail-feature-controller.js` 1872 -> 1812 lines and 89509 -> 86067 bytes. The generated bundle moves 899156 -> 899405 raw bytes because the model owner now contains the policy, but the cumulative cleanup remains below the behavior baseline 899972. Full `npm run verify`, memory (`0/200`, `0/100`, +0.09 MiB), performance, ES5, LG UX and Git integrity gates pass. Physical LG validation remains required before release signoff.

## Advanced subtitle editor seek settlement (2026-09-06)

A regression introduced by the provisional subtitle seek gate could leave local subtitles hidden for many seconds inside Advanced Subtitle Settings when LG webOS delayed native `timeupdate` events after an editor timeline seek. The editor already owns a 50 ms preview clock; that clock now attempts `releaseSubtitleSeekGate()` before rendering, so it can observe and accept the actual Direct Play keyframe/advancing clock independently from `timeupdate`. The provisional target remains hidden, bounded decoder rollback still produces an ASS discontinuity at the decoded keyframe, and normal playback seek behavior is unchanged. Automated coverage reproduces an editor seek where no `timeupdate` is emitted between `seeked` and the decoder exposing an earlier keyframe.

## Advanced subtitle editor ASS discontinuity ownership (2026-09-06)

Physical LG validation showed that the previous preview-clock fix was incomplete: subtitles could still disappear for roughly 20-30 seconds after a seek performed inside Advanced Subtitle Settings. Investigation confirmed that the video seek itself uses the same `seekAbsolute()` pipeline as ordinary Player seeking when a verified local ASS stream can be kept active; the relevant difference is subtitle ownership. `openSubtitleEditor()` copies the active local ASS payload into `subtitleEditorState` and calls `subtitleRuntime.clearLocal()`, while `SubtitleRuntime.discontinuity()` previously consulted only `localState`. Consequently seek, keyframe-settlement and buffer-repair discontinuities became no-ops during the editor preview even though `render(editorState, ...)` continued using the same libass renderer.

`SubtitleRuntime.discontinuity()` now accepts the active preview state, and every PlaybackController discontinuity call forwards `subtitleEditorState` when present. Automated RED/GREEN coverage verifies both the requested editor seek target and the later accepted Direct Play keyframe are delivered to the ASS renderer while `localState` is intentionally empty. The 50 ms editor preview clock remains in place, but it is no longer expected to compensate for a missing renderer discontinuity.

## Evidence-based deep cleanup - Phase 4 Plex/composition complete (2026-09-06)

Phase 4 is complete. The Plex compatibility surface and explicit application composition root were audited
consumer-by-consumer; only evidence-backed ownership changes and removals were accepted.

- `PlexClient` no longer owns/re-exports transport-free Home/recommendation shaping. The final owner is the
  dedicated `PlexHomeModel`, which uses `PlexMediaDocument` for raw XML attributes and `PlexMediaMapper`
  for media records. The exact development startup-script count is no longer frozen: this cohesive owner
  intentionally adds one script while remaining inside the configured fan-out and aggregate-byte guardrails.
- Home/recommendation XHR, cache/LRU, concurrency, abort and callback/error lifecycle remain in `PlexClient`.
- `activityIdFromResponse`, `activityItemsFromJson`, `accountProfileFromJson`, and `navigationDefinitions`
  are private implementation details. Their contracts are preserved through `refreshLibraryMetadata()`,
  `loadActivities()`, `loadAccountProfile()`, and `loadNavigation()` respectively.
- TV-shell source contracts now follow the semantic owners for resume mapping and Direct Stream URL policy
  instead of searching stale `PlexClient` implementation text.
- Final Phase 4 metrics: `PlexClient` 1333 lines / 55552 bytes; `ApplicationController` 1765 lines /
  101002 bytes; `PlexFeaturePorts` 83 lines / 2407 bytes; `PlexHomeModel` 162 lines / 6627 bytes; 36
  reviewed `PlexClient` exports; generated `app/app.js` 899927 raw / 177658 gzip bytes; startup assets
  129 / 130 scripts and 2208997 / 2210000 JS bytes.
- `loadRecommendedItems` is the only retained facade export without a production consumer. It stays
  intentionally test-visible because it protects recommendation cache/LRU, concurrency, retry and race
  behavior at the transport owner boundary.
- Settings backup no longer bypasses feature ports: `PlexFeaturePorts.settingsBackup()` exposes only the
  four playlist persistence operations consumed by `PlexSettingsBackupStore`.
- Fresh final Phase 4 `npm run verify` PASS. `npm run test:memory` retains 0/200 payloads and 0/100 runtime
  payloads with +0.03 MiB net heap growth. `git diff --check` and `git fsck --no-dangling` PASS.
- Runtime-size/startup budgets are measured engineering guardrails, not frozen cleanup targets. They may
  be raised when an explicit reviewed ownership/correctness benefit justifies the cost, never merely to
  silence a regression gate.

This Phase 4 checkpoint was followed by the completed Phase 5 sweep recorded below.

## Evidence-based deep cleanup - Phase 5 final sweep (2026-09-06)

Phase 5 improves test locality and performs the repository-wide Class A/B/C sweep without changing product behavior. The former 4619-line `tests/test-playback-controller.js` was split into `test-playback-controller-core.js`, `test-playback-controller-subtitles.js`, and `test-playback-controller-recovery.js`; `tests/helpers/playback-controller-harness.js` contains only fixture/timer/video construction. An automated name/order comparison confirmed all 149 original named regressions are present exactly once.

The former 2590-line `tests/test-player-feature-controller.js` was likewise split into `test-player-feature-presentation.js`, `test-player-feature-queue.js`, and `test-player-feature-settings.js`, with construction isolated in `tests/helpers/player-feature-controller-harness.js`. A second automated name/order comparison confirmed all 87 original named Player regressions remain exactly once and in order. The 1561-line Detail suite was reviewed and intentionally left whole because its behavioral boundaries do not justify duplicating or obscuring fixture/event context for line-count reduction alone.

The runtime reachability audit classified coordinator modules as generated-bundle inputs, Subtitle Octopus runtime/workers as lazy production assets, and `debug-capture.js`/`debug-timing-probe.js` as intentional on-demand physical-TV diagnostics. The only proven orphan family was `app/setup-server-session.js`: it was neither loaded nor bundled and had no production provider/consumer; only its isolated test remained. A RED source contract first proved the stale optional `serverSession` hook still existed in `SetupController`, then the hook, orphan module and isolated test were removed. Current Setup discovery/account lifecycle remains with SetupFeatureController and the server/account ports.

Current architecture authority is `docs/application-source-architecture.md`, `docs/maintenance.md`, `docs/playback-invariants.md`, and `docs/testing.md`; completed phase plans/inventories are implementation history; only the plans explicitly listed as active in `docs/README.md` are current work. Useful recovery/ASS/Web Inspector diagnostics and persisted legacy migrations remain intentionally retained.


### Phase 5 final metrics

Phase 5 is code/test/doc complete. Against behavior baseline `3389735`, non-generated/non-vendor/non-locale
application JavaScript remains 156 files and moves 51026 -> 51019 lines; generated `app/app.js` moves
899972 -> 899927 raw bytes. `PlexClient` moves 1833 -> 1333 lines, DetailFeatureController 1872 -> 1812,
PlaybackController 2966 -> 2957, PlayerFeatureController 2850 -> 2841, and ApplicationController 1769 -> 1765.
Test source moves 45776 -> 45410 lines while the test-file count rises 210 -> 214 because the large Playback
and Player suites were split by domain with fixture-only harnesses. Final `npm run verify` passes; memory retains
0/200 weak payloads and 0/100 runtime payloads with +0.02 MiB net heap growth. No cleanup WIP remains; `TODO.md`
contains product backlog only, including the deferred OK-on-visible-Skip-Intro/Credits behavior.

# Playback invariants

These rules are based on tests performed on the target LG webOS TV. Do not
change the playback clock model without reproducing every case below.

## Plex HLS clock

- Use `fastSeek=1`. With `fastSeek=0`, Plex may expose a shortened timeline
  while delivering content from near the beginning of the source.
- Initial server-offset streams start at the requested absolute Plex position,
  preserving the proven resume/startup path on legacy webOS. A rare steady-state
  VOD Direct Stream seek that cannot stay inside the current native buffer does
  not use a special HLS clock mode: it performs an internal playback reopen at
  the requested absolute position and re-enters the same normal delivery/recovery
  strategy used by a fresh player start.
- On an offset-backed HLS source, `video.currentTime` is relative to the HLS
  stream offset and the absolute Plex position is `stream offset +
  video.currentTime`. Internal reopen must not invent an alternate clock mapping,
  `copyts` mode, or subtitle offset to compensate for decoder behavior.
- Plex timeline reports, the progress bar, and the end-time estimate must use
  the absolute Plex position.
- `waiting` and `stalled` start a semantic buffering incident immediately. A
  `timeupdate` observed while the native element is actively playing but has
  dropped below `HAVE_FUTURE_DATA` starts the same incident defensively, covering
  webOS event ordering where the low-readiness sample arrives before (or without)
  a matching `waiting` event. The controller captures the last confirmed absolute time, raw
  `video.currentTime`, and active `offsetBase`, then freezes the public timeline
  and local ASS clock in the same turn. The existing 500 ms delay controls only
  spinner visibility; it is never a grace period in which native time may alter
  the progress bar, subtitles, or Plex timeline reports.
- `canplay` is not proof that the decoder clock has settled. Buffering remains
  unresolved until `playing` or the native-advance watchdog supplies a clock
  sample that passes post-buffer validation. A high-readiness `timeupdate` is
  also an event-loss fallback: after a user pauses an unresolved incident, it
  may complete validation and restore playing state if webOS omits the later
  `playing` event on resume.
- The post-buffer candidate is always evaluated as
  `offsetBase + video.currentTime` against the captured checkpoint. The active
  stream offset must be unchanged, a raw offset-HLS clock that suddenly appears
  to be in absolute Plex time is rejected, rollback beyond two seconds is
  rejected, and forward movement beyond five seconds is rejected. Nullable or
  non-finite samples are never coerced to zero.
- One rejected resume sample receives a 400 ms settlement window because webOS
  can briefly expose stale or wrong-domain native time around `playing`. If a
  plausible second sample arrives, that sample becomes the shared video/UI/ASS
  clock without replacing the source. If the impossible value persists, the
  source is rebuilt once at the captured absolute checkpoint. Before that
  replacement, local ASS opens a new epoch at the exact normalized rebuild
  target so a prepared/static state from the superseded source cannot survive
  the clock repair.
- A plausible post-buffer native rollback inside the existing two-second bound
  is an actual clock discontinuity, not ordinary jitter. The public timeline may
  adopt it, but local ASS first opens a new playback epoch so the static monotonic
  presentation barrier cannot remain ahead of the video after recovery.
- Clock repair is bounded once per explicit discontinuity, not once for the
  entire episode. A later independent buffering incident or committed seek
  receives a fresh allowance, while repeated bad samples from one incident
  cannot create a rebuild loop. `clockRepairCount` is cumulative diagnostics,
  not the repair gate.
- Pausing during buffering preserves the unresolved checkpoint and keeps the
  shared clock frozen. A committed seek supersedes that checkpoint and makes
  its exact absolute target authoritative. End, terminal pause, native error,
  source replacement, close, and destroy retire buffering timers explicitly so
  a late settlement callback cannot rebuild a superseded playback.
- Outside an explicit seek or validated post-buffer adoption, the public clock
  remains monotonic. The existing ordinary backward-drift repair remains a
  bounded fallback and must never repeatedly seek the same unstable stream.
- A non-zero Direct Play startup remains covered until webOS publishes its first
  reliable decoded timestamp. If that first timestamp rolls back by at most 15
  seconds to a seekable keyframe, the clock adopts that keyframe once without
  replacing the source. Plex reporting and subtitle rendering begin from the
  decoded position. Any later or larger regression keeps the normal bounded
  rebuild recovery.
- After an explicit Direct Play seek, webOS may briefly play the requested time,
  buffer, and resume from a nearby keyframe. During the first five seconds after
  that seek, one seekable rollback of at most 15 seconds realigns the public and
  local-subtitle clocks without replacing the source. The accepted settlement is
  itself an ASS timeline discontinuity even when webOS first emits `seeked` at the
  requested target and exposes the rollback only in a later `timeupdate`; local ASS
  must invalidate any static/prepared state from the optimistic target before the
  decoded keyframe becomes authoritative. A second rollback or any out-of-range
  discontinuity retains the normal rebuild recovery.
- Stream replacement anchors and freezes the public clock before changing the
  offset, so a new offset can never be added to the previous stream's stale
  `currentTime`.
- A verified local external-subtitle overlay follows the same frozen/validated
  absolute clock as the progress bar. During buffering the ASS worker is paused
  at the checkpoint even if raw native time continues to change. It resumes
  only from the accepted post-buffer sample or from the replacement stream
  anchored at that checkpoint. Offset HLS and transcoded subtitle paths retain
  the same absolute-time and Plex subtitle-rendering rules.
- Native `play()` is single-flight: repeated `canplay` events cannot issue a
  second start while the first request or its resume seek is still pending. A
  retry is allowed only after the bounded startup wait and never before the
  native seek has completed.
- During the first source startup, `video.paused === true` is transport state rather
  than user intent. A seek committed before startup reaches stable playback must
  retain the normal autoplay intent and resume after its replacement/source seek
  settles. This also applies after native `play()` has already been requested but
  before webOS confirms the first `playing`: `nativePlayPending` is authoritative
  evidence of play intent even if the element still reports paused. Once playback
  has reached a stable playing or paused state, explicit pause/play intent remains
  authoritative across later seek/reopen recovery.
- A late native `playing` event from a superseded session cannot release a newly
  opened stream before that stream has emitted its own `canplay` event. The new
  stream remains in startup and the stale event is paused without changing the
  public clock.
- Every replacement source, including in-place Direct Stream/transcode rebuilds and
  conservative-transcode fallback, owns fresh assignment/readiness evidence. Events
  received during asynchronous preparation cannot ready a source that has not been
  assigned, and `playing` from the preceding source cannot release the new clock before
  its `canplay`. Delayed resume and retry callbacks are tied to the playback generation
  and transcode namespace and are retired by the next clock anchor.
- HLS replacement resets and pauses the local ASS epoch at the exact normalized absolute
  source target (with the selected subtitle offset applied once). A fractional UI seek
  must not leave the ASS presentation barrier ahead of the integer Plex source origin.
  Same-track replacements preserve the allocated renderer and loaded subtitle content.
- The public position, progress bar, end-time estimate, and Plex timeline
  report are capped at the authoritative Plex duration. The raw native clock
  remains available internally for seek and recovery, but a decoder tail or
  late `timeupdate` must never move the public position past the media end.

## Seeking

### Delivery authority

- `PlaybackRecovery.fail()`, `failCurrent()`, `retry()`, `online()` and `rebuild()`
  never advance the plan. An unclassified failure stops automatic recovery and exposes
  manual retry on the same delivery; offline recovery waits on that same step.
- Only `PlaybackRecovery.fallback()` advances an existing plan. For DP and DS it
  requires `incompatibility()`: native MediaError 3 (decode) or 4 (unsupported source),
  or an explicit unsupported-codec/container/format preparation result. Numeric codes
  from request/seek/clock errors and incidental words such as "decoder timeout" are
  not evidence. Transcode retains its explicit failure path to safe-transcode.
- `PlaybackController.selectRecovery()` is the sole planner entry point. Selection
  changes re-evaluate hard device limits and native track ownership. On the same file,
  an available DP/DS step takes precedence over historical compatibility hints and
  retains its delivery, including across internal reopen. A new file or an explicit
  playback-mode change may select a new plan. Server-owned subtitles and audio that
  cannot be selected through the native full-file path may exclude DP legitimately.
- `applyAttempt()` installs the authorized step. A rebuild cannot choose another tier;
  if selection already changed the plan, it delegates installation to `applyAttempt()`
  so source options and plan cannot disagree. Duplicate native errors while fallback
  is queued or the next source is preparing cannot consume an unattempted tier.
- Trace tokens distinguish `REOPEN[...]`, `RETRY[...]`,
  `FALLBACK[recover:<source>:<evidence>]`, `FALLBACK[selection:tracks|device]`,
  and explicit `SELECT[transcode]`. Local ASS failure retains `ASSERR[...]` before
  the selection fallback required to keep rendering the selected subtitle on Plex.

Audit: recovery errors enter through `recover()`; native/prepare/rebuild/seek/clock
callers share the same classification. Track/version/settings changes, ASS failure,
editor preview/Apply/Cancel and internal reopen all use `selectRecovery()`.
`PlaybackStrategy.next()` is a pure lookup with no runtime consumer; the sole plan
increment is in `fallback()`. `PlexClient.preparePlayback()` uses the full-file URL
for DP without a decision request; it does not silently select HLS for DP. Plex's
decision can describe remux/transcode only after a non-DP plan has been authorized.

- Every UI seek target is expressed in absolute Plex seconds and enters through
  `seekPlayerTo()`. Inputs must never subtract the stream offset themselves.
- Forward seek inside the current HLS window assigns
  `absolute target - stream offset` to `video.currentTime`.
- Direct Play follows `video.seekable`, allowing the browser to request an
  unbuffered portion of the original file through HTTP Range. Every native
  seek is verified against the requested position and has a bounded timeout.
- Offset HLS streams use `video.buffered` for native seeks. A target outside the
  active buffer must not receive an unsafe relative `video.currentTime`. For the
  rare steady-state VOD Direct Stream seek whose reposition decision is
  `rebuild`, the controller performs an internal cold reopen at the absolute
  target. Ordinary native seeks remain on the existing fast path and do not
  reload playback metadata or recreate the Plex playback session. Transcode and
  non-seek rebuild/recovery paths retain their established bounded behavior.
- The internal reopen is a playback/session restart, not a visible navigation:
  it must keep the Player surface mounted, suppress normal `onOpening` and
  `onPlaybackLoaded` UI resets, preserve pause/play intent, media/part affinity,
  playback mode/quality and selected tracks, and rerun normal stream selection.
  A healthy local ASS renderer stays allocated across that reopen; if the same
  ASS content remains selected, the existing libass worker/track is reused rather
  than loaded again. If the advanced subtitle editor is open, its draft track,
  size, offset, loop state and original restore state survive the internal reopen;
  playback-bound references are rebound to the new session, an in-flight preview
  request is restarted, normal timeline reporting stays suppressed, and transport
  fields used by Apply/Cancel follow the new recovery step rather than the stale
  pre-reopen delivery. Normal close/open still disposes subtitle runtime state.
- Direct Play is sticky while the selected media/track combination remains technically
  Direct-Play-capable. A rebuild is a bounded reconstruction/retry of the current
  delivery, not permission to consume Direct Stream as a generic next recovery tier.
  The first non-terminal Direct Play rebuild may perform one guarded internal cold
  reopen at the requested absolute position. While that reopen is still settling,
  another rebuild retries the same Direct Play delivery and records `RETRY[...]`
  rather than advancing to Direct Stream.
- Terminal-window handling does not demote a usable Direct Play source. Direct Play
  keeps the full-file native clock and its existing final-five-second end handling,
  so the authoritative Plex duration is respected, playback pauses at the actual
  native end, and Up Next is notified once. The existing eleven-second terminal
  lookback remains valid only when Direct Stream/transcode is already the selected
  delivery, for example after a confirmed Direct Play compatibility failure.
- Direct Play seek failure, timeout, mismatch/regression, buffering repair, clock
  repair, terminal-window rebuild, and DP-capable stream/track switching preserve
  Direct Play. An unclassified native/prepare failure stops bounded recovery on the
  current Direct Play delivery instead of silently consuming Direct Stream.
  Direct Stream may replace Direct Play only when compatibility evidence confirms
  that Direct Play is technically unusable (codec/decoder/format/container class),
  or when normal capability planning already excludes Direct Play.
- When a verified in-place Direct Play seek emits `seeked` on an earlier keyframe,
  target verification must offer that sample to the existing `PlaybackReposition`
  settlement policy before declaring the seek failed. A rollback within the
  existing 15-second seekable window is adopted as the authoritative video,
  timeline and local-subtitle position; a rejected/out-of-policy sample requests
  bounded sticky Direct Play reconstruction rather than a delivery downgrade.
  Startup/source-switch seeks remain owned by the source-switch path rather than
  this in-place settlement shortcut.
- Backward seek before the current stream offset uses the same reposition
  decision as every other seek. When a steady-state VOD Direct Stream cannot
  satisfy that target natively and the decision is `rebuild`, the controller
  cold-reopens playback at the absolute target; offset-based recovery remains
  available to the non-seek recovery paths.
- Track changes preserve the current absolute Plex position and retain bounded
  rebuild behavior. If the newly selected track combination is still Direct-Play-capable,
  the rebuild stays on Direct Play; a track that genuinely requires server rendering or
  transcoding may legitimately produce a different capability plan. Track changes do not
  opt into the seek-only cold reopen unless a later explicit reposition decision itself
  requires `rebuild`.
- Chapter selection uses the same absolute seek path as the timeline and remote
  arrows. A chapter seek must never create a separate clock or bypass stream
  namespace rotation.
- Local subtitle presentation must not expose optimistic seek-target frames. Every
  committed local SRT/WebVTT/ASS seek hides the overlay immediately, including seeks
  made while paused and fully buffered seeks that never emit `waiting`/`stalled`. A
  paused-origin seek cannot release the overlay merely because `playing` fires: the
  first visible subtitle must wait for a subsequent decoder sample. An already-playing
  seek likewise treats a sample still parked on the exact requested target as
  provisional. The gate may release when a bounded rollback has been adopted, or when
  the native clock has demonstrably advanced from the target without rollback. If
  buffering, low readiness, or rebuild occurs, a fresh stable `playing` is additionally
  required. Decoder settlement and ASS discontinuity handling continue while hidden,
  so the first visible frame uses the decoded clock rather than the optimistic target.
  `SubtitleRuntime` owns the seek-presentation gate itself; `PlaybackController` only
  feeds it lifecycle evidence (`playing`, rebuffer/readiness and the settled native
  clock), while `PlaybackReposition` remains the sole owner of keyframe-settlement
  policy.
- Ordinary stream rebuilds assign the new source synchronously. Plex decision
  requests are reserved for initial playback and bounded recovery so a slow
  decision endpoint cannot leave remote input locked during a seek.

## Automated guards

- `tests/test-playback-clock.js` locks post-buffer acceptance and rejection for
  normal relative time, tolerated rollback, large backward/forward jumps,
  offset changes, nullable native samples, and offset-HLS native-domain flips.
- `tests/test-playback-session.js` locks first-checkpoint retention, one repair
  per discontinuity, re-arming for a later incident/seek, defensive diagnostic
  copies, and reset/close cleanup.
- `tests/test-player-buffering-indicator.js` keeps the 500 ms spinner delay
  purely visual and verifies that grace-period or watchdog native advancement
  is reported to the semantic buffering owner.
- `tests/test-playback-controller-core.js`, `tests/test-playback-controller-subtitles.js`, and
  `tests/test-playback-controller-recovery.js` lock the native lifecycle by behavioral domain;
  `tests/helpers/playback-controller-harness.js` contains only shared fixture/timer/video construction
  boundary: all thirteen regression cases below, non-zero track/version rebuilds,
  stream namespace rotation, reporting suppression, buffering reconciliation,
  immediate timeline/ASS freeze (including low-readyState `timeupdate` before a
  native waiting event), bounded post-buffer settlement, forward/domain jump
  rejection, accepted rollback ASS epoch reset, event-loss recovery after a
  buffering pause, repeated independent repair, pause/seek supersession,
  terminal/error timer retirement, subtitle Apply/Cancel rollback, stale callback
  rejection, and idempotent teardown. It also asserts that no legacy coordinator mutates native time,
  source, stream offset, or Plex timeline state.
- `tests/test-player-seek-controller.js` locks normalization, Direct Play
  `seekable` handling, buffered HLS seeking, target verification, pre-offset rebuild,
  native-duration validation, tolerance, and clock recovery behavior.
- `tests/test-playback-reposition.js` locks the owner boundary above that pure policy:
  absolute/native decisions, target verification, bounded keyframe settlement, and the
  invariant that routine reposition cannot advance `PlaybackRecovery`.
- `tests/test-playback-timeline.js` locks the stable/frozen absolute clock, terminal clamping,
  confirmed-vs-pending presentation/report positions, suppression, progress/end estimate,
  periodic Plex reporting, transcode keepalive, and adoption of the clock returned by
  `PlaybackReposition` settlement without taking ownership of seek/recovery policy.
- `tests/test-player-timeline-policy.js` locks the 20-second reporting boundary
  and both time formats.
- `tests/test-tv-shell.js` verifies that remote arrows, timeline pointer input,
  and chapters still delegate to the absolute seek gateway and that the
  gateway delegates through `PloffPlaybackReposition` to `PloffPlayerSeekController`.
- `npm run verify` is required after every player extraction. Passing browser
  tests do not replace the manual LG decoder matrix below.

## Subtitle synchronization editor

- Opening the editor captures the absolute position and paused/playing state.
- Its five-second preview suppresses Plex timeline reporting and never changes
  the captured restore point.
- Apply and Cancel both restore that exact captured point and the captured
  paused/playing state. When the editor opened on an already verified local
  SRT/WebVTT or ASS overlay and the existing seek policy says that point is natively
  seekable, restore stays on the active source and uses `seekAbsolute()` rather than
  `rebuild()`. `rebuild()` remains a bounded recovery/reconstruction operation and
  must not be used as a synonym for a routine editor reposition; by itself it does
  not authorize a Direct Play -> Direct Stream fallback. Server-rendered previews or
  unsafe native targets may still rebuild through the existing bounded recovery path.
- External SRT/WebVTT offsets are written to Plex on Apply. During the verified
  local preview, draft changes stay local until Apply. Convertible embedded
  text offsets are rendered locally and persisted by server, part, and stream.
- `SubtitleRuntime` is the single runtime authority for local subtitle presentation
  state, including the seek-presentation gate, active local payloads, renderer
  lifecycle, and whether a subtitle track may enter the advanced editor. Player UI must use the Playback facade
  `subtitleEditorAvailability(streamId?)`; it must not recreate codec, forced-
  transcode, or session-local failure rules. The query is read-only and does not
  expose `SubtitleRuntime`'s internal failed-stream map.
- `subtitle-editor-session.js` owns only editor session data and pure transitions:
  captured original options/local restore metadata, draft stream/size/offset/loop,
  preview status/payload state, defensive public snapshots, and Apply/Cancel flags.
  Raw ASS content stays private to the session and never appears in the public
  snapshot. Plex requests/writes, native reposition/rebuild orchestration, preview timers, and
  stale async-response rejection remain owned by `PlaybackController`; Octopus lifecycle,
  active local SRT/WebVTT/ASS payloads, seek-presentation gating, session-local subtitle
  failures, and rendering are owned by `SubtitleRuntime`. While Advanced Subtitle Settings is open,
  the preview state temporarily owns the active ASS timing payload after `localState` is cleared;
  every seek/decoder-settlement/buffer discontinuity must therefore be applied against the active
  preview owner rather than assuming `localState` is populated.
- Subtitle presentation edited from the Player is scoped, never global. Effective values resolve in the order current media -> season -> global Settings. The media/season records are sparse; values equal to the parent layer are omitted. Global Settings remain the bottom defaults and may be mutated only from Settings UI, never from Player Apply/Cancel.
- Apply to season writes one sparse season layer and removes from the current-media profile only fields that are applicable under the active capability matrix. Disabled local-only fields (for example ASS size or SRT size/background/edge while Plex owns the pixels) remain media exceptions, while an enabled timing field moves to the season layer and its media override is removed. It does not materialize settings across every episode. Season subtitle selection stores a stable track signature and resolves it against each episode's available tracks instead of persisting an episode-specific Plex stream ID. Existing explicit overrides on other episodes remain exceptions.
- Reset media and Reset season are editor-draft operations until Apply succeeds. Cancel persists nothing. Reset media reveals season/global inheritance; Reset season reveals global defaults while preserving explicit current-media values and never deleting overrides belonging to other episodes.
- Advanced subtitle-editor navigation follows the TV focus grammar: directional keys navigate the two-column focus graph, OK activates choice/toggle controls, and Offset/Timeline consume Left/Right only after OK has explicitly entered edit mode. Back exits edit mode before it can cancel the editor.
- Editor eligibility and row capabilities are source/ownership-aware. SRT/SubRip, WebVTT/VTT, and
  external or embedded ASS/SSA may enter Advanced Subtitle Settings. Embedded ASS/SSA is a
  playback-settings source only because Plex may return converted text rather than the original
  document. A supported selected track exposes offset/loop/timeline; size requires active local pixel
  ownership; background/edge require the local SRT/WebVTT renderer and never apply to ASS/SSA.
  Disabled rows must not receive focus/actions or overwrite scoped values that remain meaningful for
  a later local-renderer session.
- Optional local rendering may display text-based SRT/WebVTT and ASS/SSA
  tracks over the native video. The renderer receives only the confirmed
  absolute clock and must never assign `video.src` or `video.currentTime`.
  ASS/SSA timing preview changes only the clock sent to JavascriptSubtitlesOctopus;
  +/- adjustments must not seek or rebuild the native video while a verified
  local ASS/SSA stream is active. Forced Transcode keeps ASS/SSA on Plex burn-in,
  but Advanced Subtitle Settings remains available for track selection and timing;
  local-only size/background/edge controls stay disabled. PGS, VobSub, other image subtitles,
  and failed conversions remain unavailable to advanced timing without blocking
  ordinary playback.

## Regression matrix

1. Resume: content and displayed timer start at the same saved position.
   A Direct Play decoder may begin at the preceding keyframe; the common decoder
   settlement used after startup/source resume and verified native seek may adopt one
   bounded rollback (within the existing 15-second limit and a seekable range). The
   adjustment aligns content, timer, subtitles, and reporting without replacing the
   source. Normal `waiting`/`stalled` buffering does not arm a new settlement; it only
   preserves any already-pending seek settlement while the existing buffering clock
   freeze remains authoritative.
2. Forward 10 seconds: content and timer both advance by 10 seconds.
   If the decoder settles on a nearby keyframe after buffering, content, timer,
   and locally rendered subtitles must adopt the same decoded position without
   a play/rebuild/play cycle.
3. Backward 10 seconds at stream start: a new stream opens at the requested
   earlier position and continues playing.
4. Repeated backward seeks: input is accepted after each rebuild.
5. Audio or subtitle change: content resumes at the same absolute position.
6. Plex progress reports always contain the displayed absolute position.
7. Apply subtitle timing: the captured editor-open point is restored. A verified
   local overlay uses the existing native seek path when safe, while any decoder
   rollback to a nearby keyframe is adopted once by the common Direct Play settlement
   so content, timer, subtitles and reporting converge without a source reload.
8. Cancel subtitle timing: no stream, size or offset draft remains, the captured
   restore point is requested, and the same seek/settlement rules apply.
9. Buffering: the timer remains fixed until playback resumes and never jumps
   backward because of a transient native clock reset.
10. Unexpected clock regression: the stream is rebuilt once at the last
    confirmed absolute position before progress reporting continues; the
    decoder must never oscillate between two native positions.
11. Chapter selection: content and timer start at the selected chapter, then
    both backward and forward seeks remain responsive.
12. Terminal playback: the dedicated final-five-second path lands on the actual
    native end, pauses once, and notifies the existing end path exactly once.
    An explicit backward seek remains available afterward; if that steady-state
    Direct Stream seek requires a rebuild, it may use the internal cold reopen.
    The public position never exceeds the authoritative duration.
13. Superseded recovery source: if another absolute seek is requested while a
    rebuilt source is waiting for its delayed native resume, that pending seek is
    authoritative. The old delayed resume must not call native `play()`; normal
    seek coalescing rebuilds once for the latest target, and only that replacement
    source may resume and publish its verified absolute clock.

## Queue boundary

- Queue providers resolve occurrence targets and presentation windows only. They
  must never call native video methods, replace `video.src`, assign
  `video.currentTime`, rebuild streams, or report Plex timelines.
- Manual Previous/Next and Up Next may pass a target to Player only after the
  provider returns `available` or the user confirms a `confirmation-required`
  gap. `resolving`, `unavailable`, failed, aborted, and stale results leave the
  current playback untouched.
- Series queues select one immutable scope at origin creation: regular seasons
  exclude Specials, and Specials queues never cross into regular seasons.
- Series drawer positions are logical provider positions. Resolving or focusing a
  distant position may load its season segment, but must not hydrate every future
  season or remap an occurrence after an evicted segment changes remotely.
- The queue drawer may focus and activate any visible occurrence, including episodes
  or playlist entries before the currently playing item. Its bounds are the queue
  boundaries, not the current playback position.
- Playlist and collection pagination preserves the absolute occurrence identity.
  Repeated rating keys must never be merged into one logical queue record, and a
  compatibility queue must never replace that absolute identity with its local
  resident-window index.
- Moving to another episode in the same series generation invalidates any pending
  adjacent decision calculated for the previous occurrence. The completed season
  metadata may remain cached, but its stale callback must not publish a target.
- At the native end of the last queue occurrence, the automatic transition may
  publish Home as a terminal semantic target. Confirming it closes playback before
  entering Home; it must never be routed as a media item or touch the native video
  outside `PlaybackController`.
- Dismissing the terminal Home countdown preserves the completed frame and shows
  the centered Pause overlay only while playback remains at the end. Rewinding or
  leaving Player clears that overlay.

### Native HLS seek settlement (2026-09-06)

Direct Stream, transcode and safe-transcode use the same bounded decoded-seek
settlement owner as DP, with different evidence: HLS requires the native sample
in the active source's buffered ranges and the exact offset captured at seek time.
Only an explicit in-buffer seek arms it; source startup never guesses a new base.
The established 15-second rollback bound and five-second forward expiry remain
unchanged for DP. HLS adopts at most one rollback and opens the matching local ASS
epoch before releasing the subtitle gate. Exact provisional targets remain hidden.
A same-domain buffer incident inside that armed seek may settle through this owner;
ordinary buffering, implausible samples and source changes keep their existing repair
policy. A missing seeked event verified by the HLS timeout follows the same completion
path without discarding the absolute/native target early.

### Active subtitle editor clock ownership

Opening the editor transfers local subtitle ownership to its preview state. ASS
clock synchronization must receive that state, not search only the now-cleared
normal local state. Buffering, pause and native seeking pause the active preview
worker immediately, using its draft offset once; the 50ms preview timer is not
responsible for eventually correcting a still-running clock. Rendering and clock
priming choose the same active owner. A closed editor never overrides restored
local ownership. Apply/Cancel continue to suppress preview timeline reports and
restore the captured media position under the existing native/rebuild policy.

For HLS source replacement, native readiness requires an assigned source plus a
canplay observed with future data (`readyState >= 3`). A queued old canplay at
readyState 0/1/2 must not release the replacement guard. This extra readiness test
does not alter the validated DP startup/seek handling.

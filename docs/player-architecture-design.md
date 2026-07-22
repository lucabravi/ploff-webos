# Player architecture and refactor design

## Objective

Reduce the responsibilities held by `app/app.js` without changing playback,
focus, navigation, or visual behavior. Playback timing and seeking behavior
verified on the target LG TV are compatibility contracts, not implementation
details.

## Constraints

- Preserve Chrome 53 compatibility and the existing dependency-free ES5
  runtime.
- Keep one absolute Plex clock for display, reporting, resume, chapters, and
  every seek source.
- Do not introduce a framework, transpilation, modules, or asynchronous syntax
  unsupported by the target TV.
- Refactor incrementally. Every extraction must pass the complete verification
  suite before the next responsibility moves.
- Keep `app.js` as the composition root and application coordinator.

## Playback contracts

All seek entry points call one controller with an absolute target in seconds:

- remote Left and Right;
- direct timeline selection by pointer or OK;
- chapter selection;
- resume from Plex progress;
- stream rebuild after audio, subtitle, or version changes;
- recovery after a decoder discontinuity or playback failure.

The controller decides between two operations:

1. Native seek when the relative target is inside a buffered range belonging
   to the current HLS stream.
2. Exact stream rebuild when the target is before the stream offset, outside
   buffered media, or explicitly requires a replacement stream.

The public playback position must remain absolute. Buffering freezes the last
confirmed position. Stream replacement anchors the new absolute offset before
the source changes. A completed or failed operation must always release its
input and loading locks.

## First extraction

### `player-seek-controller.js`

A pure ES5 module that receives plain values and returns a seek decision. It
does not access the DOM, Plex, timers, or the video element.

Inputs:

- absolute target and media duration;
- current stream offset;
- native duration exposed by the current video source;
- buffered ranges expressed in native stream time;
- whether a forced rebuild is required.

Output:

- normalized absolute target;
- operation: `native` or `rebuild`;
- relative native target for native seeks;
- exact stream offset for rebuilds.

This makes arrow, timeline, chapter, and resume behavior independently
testable while `app.js` continues to perform the existing side effects.

### Integration boundary

`seekPlayerTo()` remains the only side-effecting gateway for user-initiated
absolute seeks in `app.js`. Its debounced commit asks the controller for a
decision, then either updates `video.currentTime` or invokes the existing
rebuild path. Remote arrows, media keys, timeline pointer input, skip markers,
chapters, and subtitle-preview movement all delegate to this gateway.

Three native-time mutations remain intentionally owned by the player
coordinator:

1. applying a `native` decision returned by the seek controller;
2. correcting a decoder clock discontinuity to the last confirmed buffered
   position;
3. applying the initial `directSeekTarget` after `canplay` for sources that
   cannot begin at a server-side offset.

Track changes, subtitle editor restoration, and bounded recovery may invoke
`rebuildCurrentStream()` directly because they replace the source rather than
seek within the active source. New UI input paths must not do so.

### `player-timeline-policy.js`

A pure ES5 module owns short and diagnostic time formatting plus the reporting
eligibility rule. Plex progress is reportable only when a playback session
exists, reporting is not suppressed, the absolute position is finite, and the
position is at least 20 seconds. `app.js` reads the absolute clock once per
timeline update and performs only the Plex network side effect.

## Later extractions

After the seek controller and timeline policy are stable, extract in this
order:

1. `player-session.js`: lifecycle, network reporting, recovery, and resume.
2. `player-view.js`: control rendering, settings panel, chapters, and focus.
3. `detail-view.js`: metadata, seasons, episodes, and playback choices.
4. `library-view.js`: library tabs, filters, grids, and containers.
5. `search-view.js` and `watchlist-view.js`.
6. `settings-view.js`, `setup-view.js`, and `diagnostics-view.js`.
7. `navigation-view.js` and shared view utilities.

Each module uses the existing UMD-style factory pattern and exposes a narrow
API. Shared mutable state is not moved into new globals; state must be passed
or owned by one module.

## Verification strategy

Unit tests cover normalization and every seek decision. Integration contract
tests assert that all UI entry points still delegate to `seekPlayerTo()` and
that the gateway delegates to the controller. Existing playback clock,
recovery, chapters, resume, strategy, and TV-shell tests remain mandatory.

The manual TV matrix in `playback-invariants.md` remains the final compatibility
check because browser simulations cannot reproduce the LG decoder and native
HLS buffering behavior.

## Out of scope

- Player redesign or new controls.
- Changes to Plex playback strategies or transcode profiles.
- New framework or build pipeline.
- Behavior changes hidden inside the refactor.

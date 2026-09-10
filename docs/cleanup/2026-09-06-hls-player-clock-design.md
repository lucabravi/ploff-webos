# HLS seek and local subtitle clock review

## Goal and authority

User request: fix seek-related desynchronization in transcoded playback with local ASS,
review all current delivery types, retain the validated Direct Play experience, and keep
LG webOS / Chrome 53 support. The user authorized execution and responsibility changes;
older handoff sequencing is not a restriction. Physical TV behavior still requires a
new device check. Synthetic native event traces are regression evidence, not TV capture.

Baseline: `51f5dcc884097da3c323fcf431d848be353b4c92`, `develop`, clean tree.
Full verify: 231 unit test files pass. Memory gate passes (0/200, 0/100; +0.06 MiB).
The archive's four dependency-bin symlinks were restored locally before verification;
no runtime source or dependency versions were changed for environment setup.

## Reproduced problems

1. TC source replacement at absolute 500 while old native time is 25 accepts a late
   `playing` before the new source's `canplay`, publishing 525. DP cold reopen already
   guards this event order; in-place TC reconstruction does not.
2. A delayed native resume from a preceding HLS replacement can run while a newer
   Plex preparation is unresolved, starting the superseded source and releasing the
   newer source's clock freeze.
3. Native HLS seeks release local subtitles at an optimistic exact target without
   the decoded-clock settlement used by DP. A following 0.5-second rollback retains
   the optimistic public/ASS time and does not invalidate the ASS presentation epoch.
4. A fractional seek that requires HLS reconstruction opens the ASS epoch at 350.8
   but normalizes the actual source offset to 350. Source replacement must re-anchor
   all clock consumers to the actual normalized absolute target.

## Chosen design

Keep one absolute media timeline; offset HLS maps `offsetBase + nativeTime` and DP
keeps its full-file clock. Do not infer a new offset from an arbitrary media sample,
change Plex fastSeek/copyts, introduce MSE, or rewrite the ASS worker.

Source transitions are one controller orchestration operation over the existing
PlaybackSession/PlaybackTimeline/SubtitleRuntime owners. Session guards replacement
readiness; resume timers carry source identity and are retired when superseded. An
HLS replacement freezes local ASS at the exact new source target and invalidates its
old epoch. Renderer and subtitle content stay allocated when ownership is unchanged.

PlaybackReposition remains the sole seek-settlement policy owner. Extend the native
seek evidence to offset HLS, using buffered native ranges (not the full seekable HLS
range). A legitimate bounded decoded rollback is adopted once in absolute media time
and resets ASS before pixels are exposed. This is not a new HLS source-origin guess.
DP startup and seek bounds remain unchanged. Source startup, explicit seek and ordinary
buffer recovery retain distinct evidence requirements, not separate public clocks.

Rejected alternatives: subtitle-only offsets would conceal a wrong media clock;
a broad player rewrite would put the validated DP path at unnecessary risk; forcing
transcode/reload for every native seek would lose the existing fast buffered path.

## Validation and device limits

Use the real controller, session, reposition, timeline and subtitle runtime with fake
native events and transport only at external boundaries. Cover TC, conservative TC,
DS/remux/audio conversion, local ASS/text, server burn-in and subtitles off. Preserve
all original DP tests unchanged. Test stale callbacks, buffered and rebuilt seeks,
backward/fractional targets, pause, buffering, editor preview, close, and terminal flow.

Run full verify and memory gates before each runtime checkpoint; rebuild generated
Player output, retain current ownership/freshness/ES5 checks, never change dependencies,
versions or playback presets simply to make tests pass. Each completed task is a local
commit plus a self-contained ZIP with .git; no branch/tag/push.

Primary platform references checked during investigation:
- https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm
- https://html.spec.whatwg.org/multipage/media.html#seeking

LG documents version-dependent HLS discontinuity support; a new browser media engine
is not a safe substitute for the native legacy platform. Browser events/tests cannot
establish that visible TV frames carry the expected timestamp. Device acceptance must
compare video/dialogue, native and absolute time, ASS and Plex reports after real seeks.

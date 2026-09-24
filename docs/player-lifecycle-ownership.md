# Playback lifetime and operation ownership

Implemented after the architectural review of baseline `61d7aa9`. This supplements
[playback invariants](playback-invariants.md); it does not replace clock, seek,
recovery or subtitle-rendering policy with another state machine.

## Three different lifetimes

The feature/screen may survive several playbacks. A playback may replace its source
several times. A queue's bounded pages and origin may survive screen exit. Do not
use one of these lifetimes as a proxy for another.

`PlaybackController` binds a copy of the selected Plex configuration to each open.
The outgoing stopped report uses the outgoing binding; incoming metadata and open
use their captured binding. Internal seek/recovery reopen keeps the current binding.
`PlaybackTimeline.reset(config)` uses the same transport identity. Editor offset
compensation retains the editor's originating config even after another PMS opens.

## Replaceable asynchronous operations

`app/playback-operation.js` exports one capability, injected by Player composition:

```js
var slot = PlaybackOperation.create({ onAbortError: reportError });
var operation = slot.begin();
operation.run(function (complete) {
  return transport.load(complete); // optional abortable handle
}, function (error, result) {
  // Only the current operation may receive this completion, once.
});
slot.cancel(); // invalidate first, then abort; slot remains reusable
slot.destroy(); // terminal
```

`operation.current()` also guards continuations after transport completion;
`slot.pending()` means an outstanding transport stage, not playback readiness.
A stage can complete synchronously, start another stage, throw, or return its
handle after supersession. The primitive handles those orderings in one place.
It neither schedules work nor owns playback policy, timers, persistence or network.

Playback has explicit slots for load, source preparation, selection, local subtitle,
editor track and editor restore. SubtitleRuntime owns its renderer-load slot. The
queue owns its metadata slot. Slots with different cancellation boundaries remain
separate; there is no global operation registry or service locator.

The native `play()` request uses an issuance token in PlaybackSession, not a network
slot. An old rejection cannot clear a newer pending native start. Source readiness
and the existing bounded startup retry remain distinct.

## Selection transaction

Track, version and settings application share `applySelection(mode, callback)`.
The latest selection owns persistence completion, local-subtitle continuation and
source installation. The rebuild position is read at commit (or from an existing
pending seek), not from the time the network request began. Existing distinctions
between version application, track rebuild and settings notification remain explicit.
Transport cancellation is best effort; the local runtime rejects stale callbacks.
This is not a distributed transaction guarantee about a remote Plex server.

## Close and destroy

The Playback facade detaches the playback and enters a synchronous `closing` barrier
before aborting requests, disposing renderers or clearing the native source. Native
callbacks cannot recover or open another playback halfway through teardown.
Each release is attempted even if another throws; the first cleanup failure is
surfaced after local ownership is released. A final-report exception cannot skip
close. Destroy becomes terminal before cleanup and still attempts listener removal.

Timeline timers reject callbacks from retired timer handles. Renderer disposal
invalidates its cached-load owner before calling external disposal. These are
resource-lifetime checks, not additional timers or fallback policies.

## Queue-to-screen boundary

`PlaybackQueueController.cancelPendingPlayback()` invalidates metadata, adjacent,
index activation, direct-start and autoplay commands without dropping queue origin
or bounded provider pages. `resetPlaybackSession()` uses the same cancellation.
Player exit invokes it and increments the feature generation; metadata handoff also
checks that generation. Late page results may populate the bounded cache, but cannot
publish the retired activation. New explicit commands can reuse those pages.
A delayed stopped-report callback does not reset an active playback's end-pause UI.

## Verification and limits

Behavioral regressions live in `test-playback-operation`,
`test-playback-controller-lifecycle`, `test-playback-controller-teardown`,
`test-player-feature-lifecycle` and the queue/session/timeline/subtitle-runtime tests.
Run `npm run verify` and `npm run test:memory`. Existing seek, HLS/source clock,
recovery, subtitles, queue providers and composition tests remain active.

All added runtime code is ES5 and adds no browser API or dependency. The operation
module is in the deferred Player manifest; the Core bundle is unchanged. Parser,
static API-contract checks and deterministic fakes are not physical Chrome 53/LG
acceptance. See the [audit](cleanup/2026-09-15-player-lifecycle-audit-it.md) for
measured results, alternatives and the remaining device test matrix.

# Player lifecycle: architectural review and design

Baseline: `61d7aa9575cf1da5863d6bd99e9742e2c8722ff0`, branch `develop`.
Source: the user-supplied `STANDALONE.zip`, not an earlier checkout.
The user authorizes autonomous design and implementation. Chrome 53 support is mandatory.

## Audit scope and evidence

Reviewed the application/deferred-Player composition, Player feature, Playback facade,
queue providers/controller, native driver, Session, Timeline, Recovery, Reposition,
subtitle runtime/editor transport, source resolver and their integration harnesses.
The clock, seek, fallback and ASS behavior was evaluated against the current playback
invariants rather than treating older architecture documents as immutable instructions.

The baseline full `npm run verify` passes. Its green suite does not cover several
adversarial orderings reproduced with the real PlaybackController:

1. Native play A remains pending, B opens and starts, A rejects. Another `canplay`
   produces a third `play()` call instead of preserving B's single-flight start.
2. Track changes at 10s and 20s finish in reverse order. The source offsets become
   `[0, 20, 10]`: a stale callback rebuilds the current media at the old position.
3. Feature configuration changes from PMS A to B before `open(B)`. The final
   `stopped` report for item A is sent using B's config.
4. A metadata request's `abort()` throws during destroy. The controller remains
   not destroyed and none of its native listeners are removed.

Additional audit risks to cover during implementation: queue metadata/adjacent work
survives screen close; editor restoration can outlive its playback; callback-based
request ownership is duplicated and handles synchronous completion inconsistently.

## Responsibility map

- Application: deferred code readiness, current navigation intent, feature ownership.
- Player feature: screen/panel state, resume choice, queue-to-playback handoff, source
  route selection, progress reconciliation, feature teardown.
- PlaybackController: playback use cases, source construction, remote selection and
  subtitle I/O, interaction between native events, clock, recovery and rendering.
- PlaybackSession: semantic transient/native readiness state. Its lifecycle label is
  a derived summary, not an independently authoritative transition machine.
- PlaybackReposition / Clock: seek verification, decoder settlement and absolute time.
- PlaybackRecovery / Strategy: delivery selection and classified fallback.
- PlaybackTimeline: stable/public clock, reporting and keepalive.
- NativeVideoDriver: physical commands/listeners on the media element.
- SubtitleRuntime / EditorSession: renderer ownership and draft/edit state.
- PlaybackQueueController / providers: bounded occurrence resolution and pending
  activation; queue origin/cache lifetime differs from playback-command lifetime.

## Alternatives

### Rewrite around a complete state machine

Rejected. The state space includes independent buffering, seek, readiness, subtitle
preview, network and delivery conditions. One enum would either multiply states or
retain parallel flags while adding a second transition authority. The reproducible
failures concern ownership of asynchronous work, not absent state names.

### Split the large controllers into more facade modules

Rejected as the primary approach. Moving code while retaining unowned callbacks and
mutable config moves the defects as well. A file-size target is not an architectural
invariant. Keep the cross-owner use cases together until a genuinely independent
policy appears.

### Explicit operation ownership and per-playback transport

Selected. Add one small ES5 `PlaybackOperation` capability for a single replaceable
asynchronous operation. It does not own timers, a scheduler, playback state, network
policy, discovery or a global registry. Each caller holds explicit operation slots.
Remove the repeated request/complete/generation bookkeeping from Playback.

`slot.begin()` supersedes the previous operation; `operation.run(start, callback)`
handles synchronous and deferred completion; `operation.current()` protects further
asynchronous stages. `slot.cancel()` invalidates before aborting; `slot.destroy()`
is terminal. `slot.pending()` describes outstanding transport, not playback readiness.
A completion is delivered at most once. A late returned request handle is aborted
when its operation was superseded before the transport call returned. Abort failure
is diagnostic and cannot restore logical ownership.

Native `play()` issuance has its own token in PlaybackSession: the rejection handler
may finish only the request that created it. Existing source readiness evidence and
bounded native-start retry remain intact.

## Transport binding

PlaybackController takes a shallow snapshot of the flat Plex config for each open.
It reports/closes the outgoing session before binding the incoming config. Internal
reopen retains the current binding. Metadata-to-open carries the captured config.
Timeline reset binds the same snapshot. Subtitle-editor compensating writes retain
the editor's original config, even after another server begins playback.

The feature's mutable candidate route is not the active playback's transport identity.
No token/config is added to public diagnostics or persisted storage.

## Selection and source lifetimes

Track/version/settings application shares one transaction: persist the selection,
configure the selected local subtitle payload, then install the authorized delivery.
Only the latest operation may continue, including its subtitle continuation. Resolve
the resume position when committing the change, using the pending seek if present,
rather than reusing a time captured before an asynchronous request. Ordinary playback
and bounded seek/recovery still use the existing delivery rules.

Source preparation has one operation slot; completed work cannot reassign a source
or consume fallback again. Metadata, local subtitle, editor-track and editor-restore
work each have their own slot because their cancellation boundaries differ.

## Closing

Invalidate/detach the active playback before calling external abort, renderer or
native cleanup. Continue cleanup after an individual release throws; preserve an
error for diagnostics/caller after resources have been released. Destroy is terminal
before cleanup begins and always attempts event/network unbinding.

Screen close also invalidates pending queue commands. Preserve queue origin and
bounded cache so returning to a playlist still works. Do not equate clearing a
countdown with cancelling metadata or adjacent resolution. A new explicit playback
request can reuse the queue; an old callback cannot reopen the screen.

## Preserved behavior and acceptance

- Runtime stays dependency-free ES5 and uses no new browser APIs beyond the existing
  Chrome 53 contract. No new dependency, global preload or additional catalog fan-out.
- DP stickiness, HLS offset/seek/terminal rules, clock repair bounds and ASS epoch,
  preview/apply/cancel semantics remain covered by the full integration suite.
- Existing renderer implementation and delivery planning are retained on evidence,
  not because of the former no-edit guidance.
- Cold start remains deferred; ordinary timeupdate/render paths add no task allocation.
- Test reversed/synchronous/reentrant/duplicate callbacks; play rejection after source
  switch; close/destroy during loads; throwing abort/native cleanup; config A/B;
  editor compensating writes after switch; pending queue activation after close.
- Full `verify`, memory gate, diff check, Git integrity, clean committed checkout and
  independently extracted checkpoint verification are required before delivery.

Physical Chrome 53/LG playback is not available in this environment. Parser/API
checks and deterministic native fakes do not substitute for physical-TV acceptance.

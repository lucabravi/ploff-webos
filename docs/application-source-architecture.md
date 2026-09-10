# Application Source Architecture

Ploff ships a Core coordinator artifact, `app/app.js`, and one deferred
`app/player.js`. Both are generated from independent ES5 UMD files; neither is
ever edited directly.
There are no ordered lexical fragments and no JavaScript under `app/source/`.

## Bundle order

`scripts/build-app.js` declares the canonical order: `PRELUDE_FILES` supplies the
small Core Player loader; `MODULE_FILES` supplies Core coordinators ending in
`application-controller.js` and `application-bootstrap.js`; `PLAYER_FILES` supplies
Player-only support modules and controllers ending in `player-composition.js`.
`npm run check:app-bundle` compares both checked-in bundles byte-for-byte with these
source lists. Shared queue/version/presentation helpers and early ASS dependencies
stay in Core. Player-owned scripts are absent from the initial HTML script list.

The final marker `app/.modular-coordinator` makes the baseline fail if legacy
source fragments or the historical generated-entry marker reappear.


### Production package startup bundle

The checked-in `app/index.html` remains modular and readable for development and tests. During
IPK staging, after generated artifacts and `build-info.js` are present but before the content cache
key is calculated, `scripts/build-production-runtime.js` replaces the ordered core startup script tags
between `vendor/webOSTV.js` and `app.js` with one ordered ES5 `core.js`. Each source file keeps its
script boundary through an explicit separator; the QR vendor is preserved raw because the local
minifier is not semantics-safe for that vendor source. The individual bundled files are then removed
from the stage. The deferred `player.js` stays separate and is required even though
it has no static script tag. The same content-derived cache identity covers both
Core and Player; the loader inherits the current `app.js` URL query.

This is a packaging optimization, not a new source owner. `vendor/webOSTV.js`, generated `app.js`,
and the packaged `core.js` remain separate startup boundaries. JavascriptSubtitlesOctopus runtime
and worker assets stay outside `core.js`; on legacy non-WebAssembly TVs `startup-metrics.js`
may initialize the one ASS worker from the document head **only when global local ASS/SSA rendering
is enabled**. With ASS rendering disabled, worker startup/prewarm is skipped entirely. Tests require exact source order, ES5 parsing, separate subtitle assets, at least a 75%
script-count reduction, and no more than a 5% increase in aggregate initial gzip bytes before this
optimization may ship.

## Ownership

Each controller owns its mutable state, timers, requests, and lifecycle:

- `shell-controller.js`: Home, navbar, backdrop, theme, and shell focus algorithms.
- `shell-feature-controller.js`: composition and lifecycle of `ShellController`,
  progressive images, background audio, recoverable view state, Home polling,
  navbar preview/long-press/reorder, clock, resize debounce, and shell teardown.
  Public focus reads are snapshots and all writes use the semantic `setFocus()`
  operation.
- `search-controller.js`: search lifecycle and remote focus.
- `search-feature-controller.js`: local/cloud Search transport, T9/session
  lifecycle, DOM measurement, result focus, preserved-result resume, pointer
  activation, request cancellation, and teardown.
- `library-controller.js`: library navigation state, cache, prefetch, query,
  refresh, and view-independent focus decisions.
- `library-feature-controller.js`: composition and lifecycle of
  `LibraryGridView`, `LibraryLifecycle`, `LibraryFilterView`, playlist and
  collection containers, and `WatchlistView`; owned Library/Watchlist DOM,
  feature-local scroll binding, paging, presentation, pointer input, and
  playlist-origin restoration.
- `settings-controller.js`: settings, language, privacy, updates, and Up Next layout.
- `settings-feature-controller.js`: Settings surface lifecycle, persistence,
  semantic keyboard/pointer input, setup-selected language publication, privacy,
  update presentation, and all Up Next layout click/apply/cancel handling.
- `server-controller.js`: server identity, routes, failover, and activity polling.
- `server-feature-controller.js`: account/profile state, network transitions,
  startup/bootstrap transport, server-controller composition, server editor,
  discovery/failover orchestration, remote-route persistence, and semantic
  server operations consumed by Setup, Settings, Diagnostics, Shell, and startup.
- `setup-feature-controller.js`: first-run, Profile Manager, and manual entry
  flows; onboarding, account/profile selection, Setup surface visibility,
  authentication/scan lifecycle, and semantic keyboard and pointer input through
  explicit language, server, account, and transition ports.
- `diagnostics-controller.js`: diagnostics view state, refresh, redaction, and
  action handling.
- `diagnostics-feature-controller.js`: Diagnostics controller composition, owned
  surface lifecycle, server/profile/device/playback snapshot shaping, local
  identity transport, and semantic keyboard and pointer ports.
- `detail-controller.js`: private Detail domain state, focus, timers, and
  refresh sequencing.
- `detail-feature-controller.js`: Detail surface, metadata/series transport,
  seasons and episodes, media preferences, mutations, progress reconciliation,
  transitions, and lifecycle.
- `playback-queue-controller.js`: logical playback-queue ownership, provider/window resolution,
  occurrence identity, adjacent resolution, drawer position/window publication, gap decisions, and
  Up Next state. It does not own queue DOM, retained cards, focus, or artwork.
- `player-queue-controller.js`: Player queue presentation owner. It consumes the private
  `PlaybackQueueController` capability and owns drawer lifecycle, retained occurrence cards,
  bounded DOM reconciliation, focus/navigation, artwork tiers/prefetch, the queue command button,
  and presentation teardown.
- `player-composition.js`: Player-only implementation wiring from live Core ports
  and the application-owned, already-warmed ASS renderer pool.
- `player-controls-controller.js`: controls, chapters, skip prompts, and settings.
- `app/native-video-driver.js`: sole physical `#player-video` capability owner: source
  assignment/removal, native seek writes, play/pause/load, media events, and read-only
  native observations. It contains no seek, recovery, reporting, or subtitle policy.
- `app/playback-reposition.js`: absolute/native seek decisions, target verification, clock
  repair decisions, and bounded Direct Play decoder settlement. It can request a rebuild
  decision but never advances the recovery fallback plan.
- `app/playback-session.js`: playback lifecycle/transient state, reopen/startup rejection,
  native-seek/play readiness, buffering/terminal state, and teardown state. It owns state only;
  timers and transport side effects stay with the capability that performs them.
- `app/playback-timeline.js`: stable absolute clock, public time clamping, progress/end estimate,
  reporting suppression, periodic Plex timeline reporting, and transcode keepalive. It may adopt
  the clock produced by decoder settlement but does not decide seek, rebuild, or recovery policy.
- `playback-controller.js`: cross-owner playback use-case orchestration, resume/rebuild/recovery,
  tracks, versions, Plex subtitle requests/writes, editor preview timers, and subtitle-editor
  reposition orchestration. Physical video commands are delegated to `NativeVideoDriver`;
  seek/settlement policy is delegated to `PlaybackReposition`; lifecycle/transient state is
  delegated to `PlaybackSession`; clock/reporting/keepalive are delegated to `PlaybackTimeline`;
  active local subtitle state, renderer lifecycle, failure policy, and presentation are delegated
  to `SubtitleRuntime`.
- `app/subtitle-runtime.js`: sole active SRT/WebVTT/ASS runtime owner. It owns local overlay
  payloads, JavascriptSubtitlesOctopus lifecycle, session-local failed streams, runtime editor
  eligibility, offset resolution, and rendering against a confirmed absolute clock supplied by
  Playback. It never assigns a media source/native time or performs Plex transport.
- `app/subtitle-editor-session.js`: side-effect-free subtitle-editor session state.
  It owns original/draft values, private ASS restore payload metadata, public defensive
  snapshots, and Apply/Cancel state transitions. It never owns the native video,
  Plex requests, renderer construction, or SRT timeline synchronization.
- `player-subtitle-editor-controller.js`: subtitle-editor presentation owner. It
  owns editor focus, track/style/rendering choices, presentation drafts, Apply/Cancel
  UI workflow, and the subtitle editor/overlay view. It consumes Playback's read-only
  eligibility query and editor commands but never owns the native video, Plex
  transport, renderer construction, or active SRT clock synchronization.
- `player-feature-controller.js`: private composition of playback, queue-domain, queue-presentation,
  controls, and subtitle-editor presentation controllers; Player DOM outside the extracted
  queue/editor owners, controls presentation, resume/error overlays, Up Next, playlist
  playback orchestration, timers, listeners, stale-callback rejection, and idempotent
  teardown. It retains cross-panel transition coordination because Player settings
  and the subtitle editor intentionally share the same transition timer.
- `choice-dialog-controller.js`: shared choice-dialog state, view, input, pointer
  selection, callbacks, and teardown.
  The dialog always renders a vertical option list; focus and the already-applied
  value remain distinct until confirmation. Shared selection controls and overlay
  panels take their colors from the `--control-*` and `--panel-*` tokens in
  the generated `app/styles.css`, built from `app/styles/core.css` and the scoped
  registered theme files described in `docs/themes.md`, which are the visual authority
  for Settings, filters, setup,
  Player settings, subtitle settings, and reusable choice dialogs.
- `media-info-dialog-controller.js`: shared media-information view, origin,
  scrolling, close command, callback, and teardown.
- `plex-feature-ports.js`: named transport ports over the existing Plex client.
  Server, Shell, Search, Library, Detail, Media Context, Settings Backup, and Player receive
  fail-fast forwarding ports containing only their declared operations. Forwarders preserve
  arguments, return values, and the original `PloffClient` invocation context. The September
  2026 consumer audit narrowed the compatibility facade and confirmed every retained feature-port
  operation has a production consumer. `PloffClient` currently exposes 36 reviewed operations:
  35 have production consumers and `loadRecommendedItems` is the sole intentionally test-visible
  transport API because its focused tests protect recommendation cache/LRU, concurrency, retry,
  and stale-response behavior.
- `plex-home-model.js`: pure Home/recommendation definitions, filtering, priority and deterministic
  merge/shaping. It depends on Plex media document/mapper owners and contains no XHR/cache lifecycle;
  those remain in `PlexClient`.
- `presentation-services.js`: pure translation, DOM text construction, media-label,
  identity, and artwork helpers shared by feature composition. It owns no mutable
  application state, timer, request, focus, or lifecycle and prevents Shell from
  becoming a generic utility facade.
- `input-controller.js`: keyboard and physical-remote precedence.
- `pointer-controller.js`: Magic Remote focus synchronization, wheel, coordinate-based
  timeline seek, long-press suppression, and delegation of ordinary clicks to the
  same complete semantic OK press owned by `input-controller.js`.

No controller reaches into another controller's private variables. Cross-domain
behavior is expressed through callbacks supplied by `application-controller.js`.
Generic presentation utilities are constructed once by the composition root and
injected directly into their consumers. Shell remains the owner of Home, navigation,
backdrop, theme audio, progressive-image lifecycle, and related focus; it is not used
as a translation, DOM factory, or media-label service by other features.

Server, Shell, Search, Library, Detail, Media Context, Settings Backup, and Player receive only
the Plex operations they consume through `PlexFeaturePorts`. Settings backup therefore does not
bypass the reviewed transport boundary: its store receives only list/create/update/delete playlist
persistence operations. Forwarding ports preserve arguments, return values, and `PloffClient` as
the invocation context. The Player port contains the playback, queue, metadata, artwork, subtitle,
and timeline operations required by Player/Playback; narrowing a port does not change the public
`PlaybackController` API or the invariants covered by `docs/playback-invariants.md`.

## Public feature contracts

Feature-controller return objects are intentional application contracts, not test
facades. `scripts/feature-contracts.json` records the supported methods for each
vertical feature. `npm run check:feature-contracts` parses every feature as ES5,
compares the exported methods with that checked-in contract, and scans production
runtime consumers for unused exports or undeclared calls. A method used only by a
test must be exercised through the same semantic entry point used in production; it
must not be re-exported solely to simplify a fixture.

Each contract-check invocation reads and parses every authored runtime file once,
then reuses that local AST inventory across features. Generated `app.js` and
`player.js` are excluded only from source-owner inventories, ESLint, and type checks;
both remain covered by freshness, ES5, size, and required-asset gates. Nothing is cached between
invocations. The coordinator and maintainability checkers share only ES5 parsing,
walking, and static-member mechanics in `scripts/lib/es5-ast.js`; their ownership
policies remain explicit in the individual checkers.

The contract checker treats `destroy()` as a required lifecycle operation even when
the composition root invokes it through the generic ownership stack. Contract
changes therefore require a production consumer, focused behavior coverage, and an
explicit update to `scripts/feature-contracts.json`.

## Composition and startup

`application-controller.js` is the application composition module. It resolves
portable `Ploff*` dependencies, creates one `ApplicationSession`, constructs the
feature controllers, supplies explicit callbacks, binds every global DOM event
through `ApplicationEvents`, invokes startup, and owns feature/shared-dialog
teardown. It contains no direct Plex transport,
feature DOM presentation mutation, feature timer, transport request generation, or
parallel active-view state. The bounded post-Home Player warm timer and single
pending first-Play intent are application-readiness responsibilities.

`ShellFeatureController` owns Home transport/polling, navbar/Home/profile/activity
presentation, the global clock, shell resize debounce, recoverable view state,
progressive images, backdrop/theme work, and background audio. Server owns
account/network/bootstrap state, Setup owns entry and profile flows, Settings
owns Up Next layout interaction, and Player owns Player presentation and orchestration.
`PlaybackController` remains the playback use-case orchestrator, `NativeVideoDriver` is the only
physical native-video owner,
and `PlaybackReposition` owns seek/settlement decisions without owning fallback progression.
`ApplicationSession` is the sole active-view source; there is no duplicate root
`appView` variable.

The final root is constrained by semantic boundaries rather than a hard line
limit: zero direct `PlexClient`, feature DOM, or feature timer ownership, one
explicit ownership stack, and no manually synchronized destroy list. Explicit
dependency maps must not be replaced with a shared context, service locator,
generic event bus, or dynamic router merely to lower a size metric.

The 2026-08-18 maintainability pass made those maps reviewable in place rather
than hiding them behind generic builders. Before the pass,
`application-controller.js` contained 81 lines longer than 200 characters, 13
longer than 400, and a maximum line length of 769. The reformatted root has no
line longer than 160 characters (maximum 158) while preserving the exact ES5
token stream. No reusable option builder was introduced because every large
feature options object represents a distinct ownership boundary; keeping each
dependency visible beside its consumer is clearer than moving the same wiring
behind another indirection.

Its returned handle exposes idempotent `destroy()`. `ApplicationSession`, every
feature/controller, shared dialogs, and the single `ApplicationEvents` binding
are registered in construction order and released in exact reverse order.
Initial synchronous constructor or startup failure cleans every already-created owner
before the original error is rethrown. Deferred Player construction does not use this
fatal path: Player/Playback roll back partial binding and child ownership locally,
and the application retains a bounded failure without destroying Core. `ApplicationEvents.bind()` is itself
transactional: partial registration removes earlier listeners, and teardown
continues in reverse order after an individual removal failure. The root has no
fixed `onclick` bookkeeping;
feature-local handlers and timers are removed by their owning feature, including
`PlayerFeatureController.destroy()`.

`application-bootstrap.js` is intentionally small. It waits for
`PloffCredentialVault.prepare`, then creates the application controller. It also
owns the outer unload binding and rejects late readiness callbacks after destroy.
It must not contain Plex transport, media formatting, search, filtering, queue,
seek, or focus algorithms.


## Deferred Player readiness

The loader owns only code readiness (`idle`, `loading`, `ready`, `failed`, `destroyed`).
`ApplicationController.ensurePlayerReady()` alone composes and registers Player.
One 1,000 ms warm timer is scheduled after `first-focusable-ui`; an early playback
request cancels that timer and immediately shares the same load. Enabled ASS pool
prewarm and the Home glyph warm remain earlier and independent, and Player reuses
that exact pool. No Player implementation global is read during Core construction.

One bounded latest intent is cleared before dispatch. Detail/Home playback, extras,
and cold Library playlist/collection activation use this same readiness owner.
The existing Core `InputCommandRouter`/`PlaybackQueueModel` classify queue activation;
Core does not take ownership of queue state. Cold pointer selection records a semantic
OK key after focusing the item, not a live DOM event, button, or queue payload.
Back, view/detail/episode changes, library occurrence/scope changes, identity reset,
and teardown prevent stale opens. Existing ready-Player calls remain synchronous.

Player construction initializes localized text before readiness. Partial child,
listener, or translation failure releases completed Player work, retains a bounded
error, and leaves Home available. Background failure is silent; an explicit playback
request shows the existing playback-error message. There is no automatic retry loop;
the application retains failure until restart (the loader's explicit reset remains
an internal capability). Startup, code-ready, and feature-ready metrics are separate
bounded numeric milestones. Automated byte reduction is not physical-TV signoff.

## Playback boundary

Composition cleanup may move Player-facing presentation and dependency wiring,
but every `PlaybackController` API change requires an explicit production consumer,
a focused contract test, and preservation of the semantics recorded in
`playback-invariants.md`. Static tests freeze the reviewed public method set and reject native
`video.src`/`video.currentTime` writes outside `native-video-driver.js` or Plex timeline/keepalive
traffic outside `playback-timeline.js`. `npm run check:maintainability` complements that contract
with alias-aware ownership checks for the native `#player-video`, guards against reintroducing
subtitle-editor eligibility/failure policy outside `SubtitleRuntime` or Plex timeline traffic
outside `PlaybackTimeline`, and reviewed 40-line / 20-`if` trend budgets for the Library, Player
Controls, and pointer focus dispatchers that were decomposed during the hardening initiative.

Runtime subtitle-editor eligibility is owned by `SubtitleRuntime`. Playback passes the current
requested mode/tracks into that capability, while the runtime keeps session-local subtitle
failures and renderer ownership private. Player presentation still queries the read-only
`PlaybackController.subtitleEditorAvailability(streamId?)` facade instead of duplicating
codec/mode/failure policy. The query exposes only `{ enabled, reason }`; failure maps and mutable
runtime payloads are not exposed.

Subtitle-editor draft state is delegated to `app/subtitle-editor-session.js`. Playback
injects the captured options/local-subtitle restore metadata into that pure session,
then remains responsible for Plex offset/stream writes, native reposition/rebuild requests,
preview timers, and stale async-response rejection. JavascriptSubtitlesOctopus loading/restoration,
active local payloads, and SRT/ASS presentation are owned by `SubtitleRuntime`; Playback supplies
only the confirmed absolute rendering clock and paused state. While Advanced Subtitle Settings is
open, the editor preview payload is the active ASS owner after ordinary `localState` is cleared, so
seek/decoder-settlement/buffer discontinuities are forwarded against that preview state as well.

`PlaybackTimeline` is the sole runtime owner of the stable absolute playback clock and direct Plex
timeline/keepalive traffic. `PlaybackController` still coordinates when cross-owner events such as
buffering, seek repair, decoder settlement, rebuild, and subtitle preview must freeze, suppress, or
re-anchor that capability; those orchestration decisions must not be copied into the timeline
module itself.

## Application session

`application-session.js` carries only application-wide identity:

```js
{
  view: 'home',
  returnView: 'home',
  settings: {},
  config: {},
  activeServer: null,
  activeProfile: null,
  selectedItem: null,
  playbackIdentity: null
}
```

DOM nodes, requests, timers, focus indexes, queue items, and player clock state
remain with their owning controllers. All active-view reads and writes pass
through this session.

## Event and input rules

Application-level DOM listeners are registered once through
`ApplicationEvents.bind()` and disposed together. Partial binding failure is
rolled back before the error leaves the helper. A feature-specific listener
may be bound by its owning feature when it is private to that surface; the
Library grid scroll listener is the reference case and is removed by
`LibraryFeatureController.destroy()`. Keyboard events enter only
`input-controller.js`; Magic Remote events enter only `pointer-controller.js`.
For an ordinary clickable control, PointerController synchronizes the logical focus
and delegates one complete OK press (`keydown` plus `keyup`) to InputController.
It must not maintain a parallel table of feature activations. Coordinate-dependent
timeline seeking, long-press navigation reordering, and clicks already owned by a
private feature listener remain explicit exceptions. The queue capture path retains
its required precedence without parallel global listeners.

Input precedence remains:

1. modal or overlay capture;
2. playback queue capture;
3. player controls;
4. setup, privacy, diagnostics, or settings;
5. detail;
6. active browsing view;
7. global navigation.

## Compatibility

All coordinator code remains dependency-free ES5 suitable for the Chrome 53
webOS WebView. No native modules, runtime package loader, transpilation, classes,
promises, arrow functions, or module imports are required by the installed app.

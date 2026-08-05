# Application Source Architecture

Ploff ships one browser coordinator artifact, `app/app.js`. It is generated from
independent ES5 UMD files under `app/coordinator/`; it is never edited directly.
There are no ordered lexical fragments and no JavaScript under `app/source/`.

## Bundle order

`scripts/build-app.js` declares the canonical module order. Domain controllers
load first, followed by `application-controller.js`, with the minimal
`application-bootstrap.js` last. `npm run check:app-bundle` compares the
checked-in bundle byte-for-byte with that ordered source list.

The final marker `app/.modular-coordinator` makes the baseline fail if legacy
source fragments or the historical generated-entry marker reappear.

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
- `playback-queue-controller.js`: queues, drawer, adjacent resolution, and Up Next.
- `player-controls-controller.js`: controls, chapters, skip prompts, and settings.
- `playback-controller.js`: native video, clock, seek, resume, reporting, rebuild,
  recovery, tracks, versions, and subtitle synchronization.
- `player-feature-controller.js`: private composition of playback, queue, and
  controls controllers; Player DOM, queue/controls presentation, resume/error/
  subtitle overlays, Up Next, playlist playback orchestration, timers, listeners,
  stale-callback rejection, and idempotent teardown.
- `choice-dialog-controller.js`: shared choice-dialog state, view, input, pointer
  selection, callbacks, and teardown.
  The dialog always renders a vertical option list; focus and the already-applied
  value remain distinct until confirmation. Shared selection controls and overlay
  panels take their colors from the `--control-*` and `--panel-*` tokens in
  `app/styles.css`, which are the visual authority for Settings, filters, setup,
  Player settings, subtitle settings, and reusable choice dialogs.
- `media-info-dialog-controller.js`: shared media-information view, origin,
  scrolling, close command, callback, and teardown.
- `plex-feature-ports.js`: named transport ports over the existing Plex client.
  Server, Shell, Search, Library, and Detail receive fail-fast forwarding ports
  containing only their declared operations; Player receives the exact original
  client object so playback transport APIs, identity, and semantics remain unchanged.
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

Server, Shell, Search, Library, and Detail receive only the Plex operations they
consume through `PlexFeaturePorts`. Those forwarding ports preserve arguments, return
values, and `PloffClient` as the invocation context. Player is the deliberate
exception: it receives the exact original `PloffClient` object, preserving every
playback API and all behavior covered by `docs/playback-invariants.md`.

## Public feature contracts

Feature-controller return objects are intentional application contracts, not test
facades. `scripts/feature-contracts.json` records the supported methods for each
vertical feature. `npm run check:feature-contracts` parses every feature as ES5,
compares the exported methods with that checked-in contract, and scans production
runtime consumers for unused exports or undeclared calls. A method used only by a
test must be exercised through the same semantic entry point used in production; it
must not be re-exported solely to simplify a fixture.

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
feature DOM presentation mutation, feature timer, request generation, or
parallel active-view state.

`ShellFeatureController` owns Home transport/polling, navbar/Home/profile/activity
presentation, the global clock, shell resize debounce, recoverable view state,
progressive images, backdrop/theme work, and background audio. Server owns
account/network/bootstrap state, Setup owns entry and profile flows, Settings
owns Up Next layout interaction, and Player owns Player presentation and
orchestration while `PlaybackController` remains the only native-video owner.
`ApplicationSession` is the sole active-view source; there is no duplicate root
`appView` variable.

The final root is constrained by semantic boundaries rather than a hard line
limit: zero direct `PlexClient`, feature DOM, or feature timer ownership, one
explicit ownership stack, and no manually synchronized destroy list. Its line
count and overlong lines are reported for review. Explicit dependency maps must
not be replaced with a shared context, service locator, generic event bus, or
dynamic router merely to lower the metric.

Its returned handle exposes idempotent `destroy()`. `ApplicationSession`, every
feature/controller, shared dialogs, and the single `ApplicationEvents` binding
are registered in construction order and released in exact reverse order.
Synchronous constructor or startup failure cleans every already-created owner
before the original error is rethrown. `ApplicationEvents.bind()` is itself
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


## Playback boundary

Composition cleanup may move Player-facing presentation and dependency wiring,
but it must not change the `PlaybackController` API or the semantics recorded in
`playback-invariants.md`. Static tests freeze the public method set and reject
native `video.src`/`video.currentTime` writes or Plex timeline reporting outside
`playback-controller.js`.

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

# Runtime Maintenance

`app/app.js` is generated. Edit the independent UMD modules under
`app/coordinator/`, then run:

```sh
npm run build:app
npm run verify
```

Never add JavaScript back under `app/source/` and never edit `app/app.js`
manually. `app/.modular-coordinator` and the baseline checks enforce both rules.
The builder removes blank-only lines from the generated runtime bundle while preserving
every executable source line; tests compare against the same deterministic compaction.

## Ownership rules

Keep one owner for every mutable lifecycle:

- domain state, timers, and requests stay in the corresponding controller;
- native video, `video.src`, `video.currentTime`, playback clock, recovery,
  reporting, keepalive, and subtitle preview stay in `playback-controller.js`;
- keyboard/remote routing stays in `input-controller.js`;
- Magic Remote focus, wheel, and click entry stay in `pointer-controller.js`; ordinary
  clicks must re-enter `input-controller.js` as one semantic OK press instead of
  duplicating feature activation logic;
- local/cloud search transport, T9/session lifecycle, Search DOM/focus, preserved
  result resume, pointer input, and teardown stay in
  `search-feature-controller.js`;
- Settings DOM/lifecycle, persistence, privacy, update presentation,
  setup-language publication, and Up Next layout input stay in
  `settings-feature-controller.js`;
- Diagnostics surface/snapshots/redaction/actions stay in
  `diagnostics-feature-controller.js`;
- first-run, Profile Manager, manual setup, account/profile selection, and
  authentication/scan lifecycle stay in `setup-feature-controller.js`;
- account/profile state, network transitions, bootstrap transport, discovery,
  failover, remote-route verification, activities, persistence, and the server
  editor stay in `server-feature-controller.js`;
- library, collection, playlist-container, and Watchlist DOM, paging, cache,
  filters, scroll listener, focus, and teardown stay in
  `library-feature-controller.js`;
- Home/navbar DOM, shared progressive images, background audio, backdrop/theme
  work, recoverable view state, shell clock/resize timers, navbar preview and
  long-press/reorder lifecycle stay in `shell-feature-controller.js`; Shell
  focus is read through snapshots and changed only through semantic operations;
- Detail DOM, metadata and series requests, seasons and episodes, media
  preferences, watched/Watchlist mutations, metadata refresh, playback
  progress reconciliation, focus, transitions, image scope, and teardown
  stay in `detail-feature-controller.js`; consumers use semantic operations
  and never retain its controller or view instances;
- Player DOM, queue and controls presentation, resume/error/subtitle overlays,
  Up Next, playlist playback orchestration, Player timers/listeners, and
  teardown stay in `player-feature-controller.js`; its private domain
  controllers are never retained by the composition root;
- shared choice and media-information dialog state, DOM, callbacks, input, and
  teardown stay in `choice-dialog-controller.js` and
  `media-info-dialog-controller.js`;
- active-view identity is read and written only through `ApplicationSession`;
- cross-domain wiring, fixed transitions, global `ApplicationEvents` bindings,
  startup invocation, and composition teardown stay in
  `application-controller.js`; exact reverse-order and constructor/startup-failure
  cleanup are executable requirements, while partial global-event registration
  rolls back inside `ApplicationEvents`; the
  root must contain no direct Plex transport, feature DOM mutation, feature
  timer/request lifecycle, dynamic router, context, service locator, or generic
  event bus;
- Plex transport exposure is restricted by `plex-feature-ports.js`; non-Player
  features receive fail-fast forwarding ports, while Player receives the exact
  existing `PloffClient` object without wrappers or semantic changes;
- pure translation, DOM text, media-label, identity, and artwork helpers come from
  `presentation-services.js`; do not route generic utilities through Shell;
- credential readiness and the outer unload handle stay in
  `application-bootstrap.js`.

Do not preserve obsolete compatibility adapters as public APIs. When an old
adapter is no longer used, delete it and update the explicit controller callback
contract instead. Setup is the reference case: `setup-feature-controller.js`
uses explicit state, language, server, account, and transition ports;
`setup-adapter.js` must not be reintroduced. Server composition follows the same
rule: consumers call semantic operations on `server-feature-controller.js` and
never retain `ServerController` or `ServerEditorView` facades in the root.
Library composition follows the same rule: consumers call semantic operations
on `library-feature-controller.js`; the root must not retain Library views,
touch Library/Watchlist DOM, or recreate the feature-local scroll binding. Shell
composition is owned by `shell-feature-controller.js`; consumers must not retain
the object returned by `focusState()`, mutate ShellController state directly, or
recreate shell timers, image/audio owners, view-state actions, and navbar hold
state in the root. Detail composition is owned by
`detail-feature-controller.js`; the root must not construct its controller or
views, mutate `detail-view`, duplicate Detail timers/requests, or apply late
mutation and progress callbacks outside the feature generation boundary. Player
composition is owned by `player-feature-controller.js`; the root must not
construct the three Player domain controllers, render Player DOM, bind
Player-specific clicks, retain Player timers, or accept late callbacks outside
the feature generation boundary. Native source/time writes must remain confined
to `playback-controller.js`. Shared dialogs must be opened through semantic
controller operations rather than by retaining view instances or apply/focus
callbacks in the root.

Playlist return restoration uses the queue occurrence and active queue index,
not title or rating key alone. When a duplicate item is present, preserve its
occurrence. The compatibility queue must keep `index`, `currentItem`, and
`currentOccurrenceId` synchronized with the exact provider occurrence; restoring
by rating key must never collapse an absolute provider position to a local
one-item window index. Provider-backed queues must reload only the page/window containing
the target occurrence; they must never hydrate the complete playlist or
collection merely to restore focus. A short terminal container page is authoritative
even when Plex still advertises a larger total. That discovered boundary is monotonic:
concurrent pages at or beyond it must be ignored and removed from the bounded cache,
regardless of response order. Every published window must keep `start <= end` after a
concurrent shrink. A remotely changed page must be rejected before it can alter the
established sequence boundary. Transport exceptions, malformed item containers,
and oversized pages are recoverable errors: they must release request ownership,
leave the cache unchanged, and permit a later retry. Series absolute-position
resolution must likewise re-evaluate its season and local index after loading
changes an earlier playable count.
Profile refreshes
may show the loading spinner, but existing profile buttons and avatars must be patched
in place rather than replaced when the list remains visible.

Direct playlist startup owns its transition cleanup. Success, callback failure,
immediate start rejection, Back cancellation, failed origin restoration, and feature
teardown must all remove or cancel the same coalesced feature-owned timer.

Queue input and render paths are performance-sensitive. Read each feature
snapshot at most once per event or render phase, reuse retained occurrence cards,
reconcile only changed edge nodes, avoid unchanged DOM or style writes, and never
restart an identical artwork request. Focus updates must use the retained-card
index rather than querying the complete drawer subtree. Provider windows must be
fetched by page, not through one cache lookup or network request per occurrence.

Series navigation uses the same provider-window rule as playlists and
collections. Do not restore eager future-season hydration or a second legacy
adjacent polling path: the active season is resident, distant seasons are loaded
only when an adjacent decision or drawer window intersects them, and an evicted
season whose ordered fingerprint changes must be rejected for that queue
generation.
Once a season segment is loaded, its logical drawer count comes from the
playable records actually retained, not from a stale declared `leafCount`.
If that count changes offsets for later seasons, rebase and stabilize the complete
requested window before publishing it; the stabilization pass must reuse resident
segments rather than issue duplicate Plex requests.

Adjacent resolution has one owner per direction. Repeated activation while a
request is resolving must not replace its callback, and Up Next must not attach
behind a manual Next request already in flight. Automatic Up Next resolution owns a
separate decision token: seeking at least five seconds away from the end invalidates
both pending resolution and a visible countdown without cancelling future manual Next.
Unsupported playback origins
resolve immediately as `unavailable`; never fall back recursively. While a
series-gap confirmation owns the Player overlay, block all new Previous, Next,
and Up Next resolution until the confirmation is completed or invalidated. The
first visible confirmation keeps ownership: duplicate or late results cannot
replace its target or source. Any logical queue replacement invalidates it
immediately. Changing the current episode inside the same series generation also
invalidates adjacent decisions owned by the previous occurrence, while allowing
an already-completed season request to remain reusable in the bounded cache.

Gap-modal focus changes must not rewrite unchanged labels or reassign an
unchanged artwork URL. Reassign `img.src` only when the resolved source or
rendered dimensions change, and clear it when the target has no artwork or the
modal closes. Moving toward the already-selected modal action must not publish
another presentation snapshot.



### Runtime bundle budget

The generated coordinator bundle currently uses adjustable engineering guardrails
of 800,000 raw bytes and 165,000 gzip bytes. They are regression alarms, not a
platform limit or a mandatory product ceiling. The thresholds may be raised
intentionally when useful functionality requires it, after measuring startup,
memory, and responsiveness on legacy TVs. New work must still keep source code
clean, ordered, readable, and deduplicated where ownership genuinely overlaps;
do not increase the guardrail to excuse dead code or accidental duplication.
The build first assembles the explicit coordinator module order, then performs
deterministic ECMAScript 5 token minification. The minifier removes comments and unnecessary
separators, never mangles function names or properties, and accepts output only
when its normalized Acorn syntax tree is identical to the assembled source. A
line-preserving fallback handles automatic-semicolon-insertion boundaries.
Coordinator source files remain fully formatted and authoritative.


## Composition-root guard

`npm run check:architecture` enforces the final static root boundary through an
ECMAScript 5 AST: no direct `PlexClient` transport, feature presentation mutation,
root-owned feature timer, private domain-controller construction, native-video write
outside `playback-controller.js`, mutable snapshot alias, or legacy source/adapter.
The command reports line count and overlong lines as non-blocking readability
metrics. `tests/test-application-composition.js` is the authority for behavioral
claims such as reverse teardown, partial-construction cleanup, startup order, and
cross-feature restoration; do not replace those tests with source regexes. Do not
reduce the root by hiding explicit dependencies in a generic context; reduce it only
when a real owner can accept a coherent responsibility.

`tests/test-controller-contracts.js` freezes the `PlaybackController` method set.
Moving Player presentation or wiring is allowed, but changing play/pause,
resume, seek, offset, rebuild, recovery, reporting, keepalive, buffering,
track/version, or subtitle-timing logic requires a concrete defect, a focused
regression, and explicit review against `docs/playback-invariants.md`.

## Presentation services

Use `presentation-services.js` only for pure translation, node/text construction,
media labels, stable media identity, and artwork URL normalization. It must not gain
feature state, requests, timers, focus, navigation, or teardown. Feature-specific DOM
and lifecycle remain with the owning feature; Home, navbar, backdrop, theme audio, and
progressive-image ownership remain with Shell.

### Artwork sizing invariant

Generate full poster, episode, chapter, queue, and Up Next artwork from the rendered
`img` box through `ProgressiveImages.renderedSize()`. The helper rounds fractional CSS
pixels down, so a request never exceeds the visible element. Do not restore fixed 2x
cover URLs or use `Math.ceil()` for rendered artwork dimensions. Constructing a Plex
poster URL is pure string generation and does not prefetch the image: the cover request starts
when the visible view assigns `img.src`. Up Next therefore resolves and assigns its exact-size
cover synchronously in the same render pass. Its separate 640x360 backdrop prefetch still runs
when playback metadata becomes available and must not be confused with the cover request.
Lightweight previews may be smaller, while full-screen backdrops may request the 1920x1080 TV
canvas. Progressive image jobs retain their preview and full URLs for their
lifetime and keep queued work ordered incrementally by priority and creation
sequence. Do not restore whole-queue sorting on every pump. Bulk scope or global
cancellation must suspend pumping until all matching jobs have been invalidated,
so work about to be cancelled is never started transiently. A completed, failed,
detached, cancelled, or destroyed job must release its target binding, preview
callback, preload, and completion closures. Live card nodes may keep the rendered
preview or full URL, but must never retain a finished job graph.

## Plex transport ports

Do not pass the complete `PloffClient` object to Server, Shell, Search, Library, or
Detail. Update the relevant named port in `plex-feature-ports.js`, add a focused port
test, and verify the composition test before exposing a new transport operation.
Forwarders must preserve arguments, return values, and `PloffClient` as `this`. Player
is intentionally different: `PlexFeaturePorts.player()` returns the exact original
client object. Do not wrap, subset, or reinterpret it; preserve the public
`PlaybackController` API and every semantic invariant in
`docs/playback-invariants.md`.

## Plex parsing boundaries

Keep paginated XML loading inside `PlexClient.loadPagedContainer()`. A new library or container
view should supply only its URL, optional filter/transform, item mapper, and library identity.
Never calculate continuation from rendered cards: `pageItemCount` must be captured before
filtering and before Recently Added grouping so Plex offsets remain exact.

Keep `/library/metadata/...` request lifecycles separate, but parse Video/Media/Part/Stream trees
through `mediaDocumentFromXml()`. Playback and media detail may select or present those groups
differently; they must not reimplement the XML traversal.

Add track fields through `MediaProfile.trackFromAttributes()` first. `PlexClient.trackFromAttributes()`
is a compatibility-preserving delegation for playback records. Presentation-only casing belongs
in `MediaProfile` and must not leak back into playback matching, subtitle synchronization, or
stored preferences.


Keep raw XHR lifecycle rules in `plex-http.js`. `PlexClient`, `PlexAuth`, and `WatchlistClient`
should provide endpoint-specific headers, timeout, and error factories rather than duplicating
ready-state, timeout, synchronous-failure, or abort handling. Completed and aborted
requests must detach their XHR handlers before releasing ownership. Do not move response parsing
or credential policy into the transport.

Build audio, subtitle, and media-version dialog records through `media-choice-model.js`.
The module may own values and lookup only; localization, automatic/off semantics, persistence,
focus restoration, and playback mutation remain with Detail or Player.

Use `search-text.js` for every local/cloud search comparison. Do not add a second accent or
punctuation normalizer to a parser, model, or view.

## Feature public contracts

Run `npm run check:feature-contracts` whenever a feature return object or a
composition call changes. The command checks `scripts/feature-contracts.json`
against the actual ES5 AST and production consumers. Remove an export only after
its production use has disappeared; add an export only with a real production
consumer and focused test. Do not keep controller aliases, raw view accessors, or
mutation helpers public for test convenience. Tests must enter through the same
semantic operations used by `application-controller.js`, `InputController`, or
`PointerController`.

## Asynchronous work

For every request or timer:

- assign it to one owner;
- abort or invalidate it when leaving the owning state;
- suppress stale callbacks before they mutate state or DOM;
- make `destroy()` idempotent;
- remove subscriptions and event bindings during teardown;
- add a focused regression test for late completion and repeated destroy.

Every global application DOM listener, including fixed dialog buttons, must be
registered through the single `ApplicationEvents` binding group. The root must
not assign `onclick` properties or maintain parallel fixed-handler bookkeeping.
A feature-local listener may be registered by its feature only when that feature
removes it during idempotent teardown; Player-owned handlers are cleared by
`PlayerFeatureController.destroy()`.

## Physical-TV signoff integrity

When the numbered physical-TV matrix in `docs/testing.md` changes, recompute the
normalized matrix digest and update `docs/release-signoff/TEMPLATE.md`. The unit test
must remain green. Never copy a `PASS` from an older matrix:
`check-release-signoff.js` requires the exact SHA-256 and intentionally rejects a
same-count stale signoff.

## Adding a coordinator module

1. Implement an ES5 UMD file with a narrow `create()` contract.
2. Add focused Node.js tests with fake dependencies.
3. Add it to `MODULE_FILES` before `application-controller.js`.
4. Inject it from `application-controller.js`; do not access another module's
   private variables.
5. Rebuild and run the full verification suite.

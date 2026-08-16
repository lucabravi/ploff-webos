# Architecture

Ploff is a dependency-free webOS application built for the older Chrome 53
WebView. Runtime JavaScript uses ES5 syntax and communicates directly with Plex
Media Server over the local network.

## Architecture at a glance

```text
TV shell (index.html, styles.css, generated app.js)
  |
  +-- ApplicationController (composition only)
  |     +-- Shell / Search / Library / Detail / Player / Settings / Setup / Server / Diagnostics
  |     +-- explicit semantic ports between feature owners
  |
  +-- PlexClient / PlexHttp --------------------------> Plex Media Server
  +-- webOS Luna discovery service -- multicast GDM -> local network
  +-- Settings / credential vault / bounded caches --> TV-local persistence
```

The application has one shared DOM, one generated stylesheet, and one generated ES5
coordinator bundle. Feature controllers own their own DOM, timers, requests, and
mutable state. Cross-feature communication goes through explicit ports supplied by the
composition root rather than through shared controller internals.

## Components

- `app/` contains the TV interface, player, Plex API client, authentication,
  settings, server discovery, and remote-control navigation.
- `app/coordinator/` contains the complete ES5 UMD application modules. Each
  file parses independently, owns its private mutable state, and receives
  platform services and cross-domain callbacks explicitly.
- `app/coordinator/application-controller.js` is the composition root: it
  creates the application session and feature controllers, supplies explicit
  cross-feature ports, starts the application, and owns only global bindings.
- `app/coordinator/application-bootstrap.js` is the minimal credential-readiness
  and unload gate. It contains no media or navigation algorithms.
- `app/app.js` is the single generated coordinator artifact executed by webOS.
  It is checked in for packaging and must never be edited manually.
- `app/i18n.js` is the small locale registry; `app/locales/` contains one
  complete offline locale file per supported interface language.
- `webos-service/` provides UDP-based Plex GDM discovery because browser code
  cannot send multicast packets.
- `webos-shell-app/` contains the webOS manifest and application icons.
- `scripts/` packages and installs the application with the LG webOS CLI.
- `tests/` contains dependency-free Node.js and shell regression checks.

Small state modules keep behavior testable without a browser. Episode boundary
resolution, chapter focus, localized media labels, resume choice, subtitle cue
timing and offset persistence, and diagnostic redaction live outside the
coordinator; controllers own the related Plex requests, lifecycle, and focus.
Shared domain modules also centralize cancellable Plex HTTP transport, media-choice
identity, media-profile normalization, technical file-size formatting, search-text
normalization, and server identity matching without taking feature lifecycle ownership.

Settings, server selection, diagnostics, onboarding/profile rendering, detail
metadata, player controls, queues, playback, keyboard input, and Magic Remote
input are owned by independent ES5 UMD controllers. Pointer input synchronizes the
logical focus, while ordinary click activation reuses the same semantic OK route as
the physical remote; only coordinate- or long-press-specific interactions remain
pointer-owned. Existing pure modules and views remain the preferred place
for deterministic transformations and DOM-specific presentation contracts.

## Modular coordinator

No runtime JavaScript lives under `app/source/`; the modular baseline is activated by
`app/.modular-coordinator`. Physical-TV release signoff is deliberately separate from
structural/runtime verification and is bound to the exact normalized matrix in
`testing.md` by SHA-256; signoff evidence from a different matrix is not reusable.

```text
app/coordinator/
  plex-feature-ports.js
  presentation-services.js
  settings-controller.js
  settings-feature-controller.js
  diagnostics-controller.js
  diagnostics-feature-controller.js
  setup-feature-controller.js
  server-controller.js
  server-feature-controller.js
  search-controller.js
  search-feature-controller.js
  shell-controller.js
  shell-feature-controller.js
  library-controller.js
  library-feature-controller.js
  detail-controller.js
  detail-feature-controller.js
  queue-sequence-contract.js
  bounded-queue-cache.js
  plex-container-queue-provider.js
  series-queue-provider.js
  playback-queue-controller.js
  queue-gap-controller.js
  player-controls-controller.js
  playback-controller.js
  choice-dialog-controller.js
  media-info-dialog-controller.js
  player-feature-controller.js
  input-controller.js
  pointer-controller.js
  application-controller.js
  application-bootstrap.js
app/application-session.js
app/queue-gap-view.js
```

Every coordinator file is an independent UMD module and is included directly in
the syntax, lint, and `checkJs` validation scope. `scripts/build-app.js` concatenates these files
in one explicit order, with `application-bootstrap.js` last, to produce the
single ES5 `app/app.js` loaded by webOS.

`application-controller.js` creates one `ApplicationSession`, constructs feature
controllers with explicit callbacks, binds every global application event
through `ApplicationEvents`, invokes startup, and owns application teardown. It
performs no Plex transport, feature DOM mutation, or feature timer work. Owners
are registered in construction order and destroyed in exact reverse order;
constructor, event-binding, and startup failures clean all earlier owners before
the original error is rethrown. `ApplicationEvents.bind()` also rolls back prior
listeners when registration fails partway and continues teardown if one listener
removal throws.
`search-feature-controller.js` composes Search transport, DOM measurement,
focus, preserved-result resume, and lifecycle around
`search-controller.js`. `settings-feature-controller.js` composes the
Settings controller, owns the Settings surface lifecycle, publishes persisted
settings through `ApplicationSession`, and exposes semantic input and pointer
operations without root-level view facades. `app/settings-schema.js` is the persisted
Settings field registry; `app/settings.js` separately owns the versioned storage contract,
validation orchestration, Plex seeding, and sequential migration from older persisted keys.
`app/settings-catalog.js` remains presentation-only, so upgrades happen before feature
construction without coupling persistence metadata to Settings UI rows.
`diagnostics-feature-controller.js`
composes the diagnostics controller, owns the Diagnostics surface lifecycle,
forms device/server/playback/Settings/compatibility snapshots from explicit providers, and
exposes semantic input and pointer operations without root-level diagnostics helpers.
`support-snapshot.js` reduces those values through privacy-safe allowlists before export.
`setup-feature-controller.js` permanently replaces the transitional Setup
adapter, composes onboarding/profile presentation and auth/scan lifecycle, owns
first-run, Profile Manager, and manual-setup entry flows, and consumes explicit
language, server, account, state, and transition ports.
`server-feature-controller.js` owns account and profile state, network
transitions, startup/bootstrap transport, server discovery, failover, remote-route
verification, activity polling, persistence, and the server editor. Shell owns
active-profile and activity presentation; Server publishes semantic state only. `library-feature-controller.js` composes the Library controller, grid,
lifecycle, filters, playlist-container presentation, and Watchlist view. It owns
their DOM, paging, cache restoration, focus, pointer routing, local scroll
listener, playlist progress summary, return-from-playback restoration, and
teardown. `shell-feature-controller.js` composes `ShellController`, the shared
progressive-image loader, background audio, recoverable view-state surface,
Home polling, navbar preview/long-press/reorder lifecycle, resize debounce, and
clock timer. Its focus API returns snapshots; cross-feature consumers update
focus only through `setFocus()`. The composition root supplies explicit data,
presentation, and transition ports; it no longer owns Home/navbar rendering,
shell artwork/theme work, shell timers, or mutable Shell focus.
`detail-feature-controller.js` composes `DetailController`,
`DetailPresentationView`, `DetailEpisodeView`, and
`DetailPreferenceState`; it owns the Detail DOM surface, metadata and series
loading, media preferences, watched/Watchlist mutations, metadata refresh,
playback-progress reconciliation, focus, transitions, image scope, and
idempotent teardown. The root communicates with Detail only through semantic
operations and no longer mutates the Detail surface directly.
`player-feature-controller.js` privately composes `PlaybackController`,
`PlaybackQueueController`, and `PlayerControlsController`; it owns Player DOM,
queue and controls presentation, resume/error/subtitle overlays, Up Next,
playlist playback orchestration, Player timers/listeners, and feature teardown.
`PlaybackQueueController` coordinates the bounded Series and Plex-container
providers through semantic occurrence results. `QueueGapController` and
`queue-gap-view.js` own the shared incomplete-sequence decision without exposing
provider state through `ApplicationSession`. The native-video algorithms remain
exclusively in `playback-controller.js`.
`choice-dialog-controller.js` and `media-info-dialog-controller.js` are the sole
owners of their shared dialog DOM surfaces and callbacks. The media-info owner has
a read-only Player information mode and a Detail version-browser mode: Detail
supplies immutable preview choices plus an apply callback, while the dialog owns
preview focus, technical scrolling, Cancel/Apply navigation, and commit timing.
Controllers do not read or mutate another controller's private state.

`application-controller.js` contains explicit dependency resolution, feature
construction, fixed cross-feature transitions, global event wiring, startup calls,
and teardown through one reverse ownership stack.
`npm run check:architecture` uses an ECMAScript 5 AST to reject direct root Plex
transport, feature presentation mutation, root-owned feature timers, private
controller construction, mutable snapshot aliases, and native-video writes outside
`playback-controller.js`. Reverse teardown, partial-construction cleanup, startup,
and cross-feature restoration are verified by executable composition tests instead
of source regexes. Physical and overlong line counts are reported as readability
metrics rather than a hard target: explicit ports are preferable to compression or
a hidden context, service locator, event bus, or dynamic router. Further reduction
must correspond to a concrete ownership improvement.

`application-bootstrap.js` waits for `PloffCredentialVault.prepare`, starts the
application controller only after credential storage is ready, and owns the
outer unload lifecycle. A late credential callback cannot resurrect an already
destroyed application.

`application-session.js` is the sole active-view source and is limited to the
current view, return view, settings, configuration, active server/profile,
selected media, and playback identity. It contains no DOM nodes, timers,
requests, focus indexes, queue contents, or player clock state.


## Current verification status

The authoritative local verification sequence is:

```sh
npm ci
npm run verify
npm run test:memory
```

`npm run verify` checks the generated bundle, independent coordinator parsing,
architecture and feature contracts, adjustable bundle guardrails, ECMAScript 5
compatibility, ESLint, both JavaScript type checks, unit and baseline tests, assets,
and LG UX constraints. The separate memory gate exercises teardown and collection
under repeated lifecycle pressure.

If dependency installation or an individual gate is unavailable in a particular
environment, record the exact limitation and run only the explicitly named supported
checks. An unexecuted command must never be reported as passing. Physical-TV
verification remains mandatory before release signoff.

## Credential Storage

The packaged TV app keeps authentication state behind `credential-vault.js`.
On webOS it registers a private, app-owned DB8 kind and exposes an in-memory
storage adapter to the synchronous application core. This keeps Plex account
and profile credentials out of browser `localStorage` without making the
composition root asynchronous.

At first startup after upgrading, an existing `ploff.auth.v1` record is moved
from `localStorage` into DB8 and the plaintext record is removed. DB8 writes are
serialized so disconnect and profile changes cannot complete out of order. If
private DB8 is unavailable, the adapter fails closed to session memory; local
browser development retains the normal storage adapter because DB8 is a webOS
platform API.

## Configuration

`app/config.js` contains neutral publishable defaults. Packaging explicitly
excludes local overrides, so distributable IPKs cannot contain a fixed server
or token. The application discovers Plex servers and stores its selected
server, viewing profile, and interface preferences in webOS local storage.
When GDM finds no server, the same setup surface can query the signed-in Plex
account for owned or shared servers. Candidate LAN, direct-remote, and Relay
connections are tried in that order; only a verified endpoint is cached.
GDM and unauthenticated `/identity` responses are discovery hints, not proof of
ownership. A discovered URL cannot merge into an account server merely by
claiming the same machine identifier. For signed-in profiles, usable routes
must come from Plex account resources and an unauthenticated identity response
must match the expected server before the route is selected.
The same ordered probing is used after a primary navigation request fails. A
successful failover promotes the endpoint in both server and active-profile
state, while an exhausted failover leaves the local UI and manual server editor
available.

Search first queries the active server's ranked `/hubs/search` endpoint and
filters out unrelated recommendations. When an account token is available, a
bounded Plex Discover search supplies alternate-language titles. Text matches
and the provider's first high-confidence alias are considered; each cloud GUID
must still resolve through `/library/all` on the active server before it can be
merged into the visible results. Cloud failure never replaces or blocks local
results.

## Playback

The native HTML5 player uses a bounded delivery ladder: compatible Direct Play,
Plex Direct Stream, requested transcoding, then a conservative 8 Mbps fallback.
Direct Play is enabled only for capabilities reported by webOS and is skipped
when the chosen tracks require Plex processing. Playback diagnostics show the
source version, device UHD/HDR support, and effective delivery mode. Progress
is reported back to Plex throughout playback. A discontinuity-resistant clock
freezes during buffering and stream replacement, while explicit seeks remain
free to move backward. Direct Play follows native `seekable` ranges and is
retained whenever webOS reaches the requested point; failed seeks and decoder
clock regressions recover through an offset-capable Direct Stream before any
transcoding fallback. The clock and seeking rules verified on the target TV are
documented in [`playback-invariants.md`](playback-invariants.md).

The final `playback-controller.js` remains the sole owner of the native video
element, assignments to `video.src` and `video.currentTime`, stream namespace,
stream rebuild, playback clock, timeline reporting, recovery, and subtitle
preview lifecycle. Its public API is regression-frozen to `open`, `close`,
`toggle`, `seekAbsolute`, `changeTrack`, `changeVersion`, `startAdjacent`,
`startItem`, subtitle-editor operations, `snapshot`, `diagnostics`, and
`destroy`. Moving presentation or wiring does not authorize changing play/pause,
resume, seek, offset, rebuild, recovery, reporting, keepalive, buffering, track,
version, or subtitle-timing semantics.

Advanced synchronization is limited to text subtitles that Plex can expose as
WebVTT. External offsets are persisted by Plex; embedded text offsets are
stored locally per server, media part, and stream. Image subtitles and ASS/SSA
remain available for ordinary playback but disable the advanced editor.

## Plex parsing ownership

`PlexClient` owns transport and the interpretation of Plex container boundaries. Library
catalogs, Recently Added, playlist catalogs, and Playlist/Collection contents pass through
one internal paginated-container pipeline. It parses each XML response once, measures the
raw Plex page before filtering or grouping, and applies the same `totalSize`, `nextStart`,
and `hasMore` rules everywhere. This preserves server offsets when several episodes become
one card or invalid container entries are omitted.

Metadata requests for playback and technical media details retain independent request and
cancellation lifecycles, but share one Video/Media/Part/Stream document traversal. The parsed
ordered version groups feed both playback version selection and `MediaProfile`, preventing the
two surfaces from assigning different media or part indexes.

`MediaProfile` is the authoritative source for Plex track normalization. `PlexClient` delegates
playback track records to it, while `MediaProfile` applies presentation-only formatting such as
uppercase codec labels to technical-detail records. Track identity, language, source, offset,
channels, layout, and display-title semantics therefore remain common.

`PlexHttp` owns the low-level cancellable XHR completion contract shared by `PlexClient`,
`PlexAuth`, and `WatchlistClient`: bounded timeout, 2xx completion, deferred synchronous
failures, and abort suppression. Each client still owns its endpoint, headers, response parser,
and user-facing error wording.

`MediaChoiceModel` owns only stable dialog identities and pure choice records for tracks and
media versions. Detail and Player retain their independent dialog, preference, focus, and
playback side effects. `MediaInfo` reuses `MediaProfile.trackDisplayLabel()`, while
`MediaProfile.detailedSize()` keeps Player and Diagnostics technical size labels consistent.

Local Plex filtering and cloud-result relevance use the same `SearchText` normalization for
case, accents, punctuation, and term splitting.

## Views And Layout

Home, search, Watchlist, libraries, collections, and playlists share the same
poster geometry and bounded progressive image loader. Low-resolution previews
preserve the rendered aspect ratio; final requests derive from the measured card
size, and recycled cards replace identity, captions, rating, progress, and
artwork as one update. The global poster-size setting changes layout measurements
and virtualization windows. Independent artwork and backdrop quality settings use
separate ranges (70–100% for posters and thumbnails, 50–100% for backdrops) and
scale only the dimensions requested from Plex, leaving the rendered geometry
unchanged; backdrop requests remain bounded by the 1920x1080 UI canvas. Chapter
thumbnails use the shared artwork-quality path. Loading, empty, and recoverable
error states share one
remote-friendly surface; search keeps its state inline so the keyboard remains
usable while a query changes.

All cancellable Plex, account, Watchlist, and image requests suppress stale
callbacks after a view changes. Immediate browser failures are deferred through
the same asynchronous completion path, preventing request handles from racing
their owning controller state.

## Compatibility

The installed application intentionally avoids frameworks, runtime dependencies,
build-time transpilation, modern JavaScript syntax, CSS Grid, and browser APIs
unavailable in Chrome 53. Development uses ESLint and TypeScript's JavaScript
checker without changing the delivered syntax. `npm run verify` confirms that
`app/app.js` matches the canonical coordinator sources, then runs the ECMAScript 5 parse gate, lint, type-checking, tests, asset
checks, and LG UX checks. Keep new runtime code
ES5-compatible and run the complete verification suite before packaging. The
manual playback and navigation matrix is in [`testing.md`](testing.md).

Lifecycle guidance for the modular coordinator is documented in
[`application-source-architecture.md`](application-source-architecture.md) and
[`maintenance.md`](maintenance.md). Behavioral ownership is frozen by the focused
controller, feature, composition, lifecycle, and bundle contract tests described in
[`testing.md`](testing.md).

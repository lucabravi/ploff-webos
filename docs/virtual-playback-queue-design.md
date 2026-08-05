# Virtual Playback Queue Design

## Goal

Provide reliable Previous, Next, Up Next, and queue-drawer navigation for:

- episodic series across regular-season boundaries;
- Plex playlists;
- Plex collections.

The queue must remain responsive with thousands of items without retaining the
entire queue, its DOM, or all decoded artwork in TV memory. Queue orchestration
must never take ownership of native playback.

## Core Model

The application treats each playback origin as one complete logical sequence,
but materializes only a bounded window around the active or focused occurrence.

Each queue exposes:

- a stable origin identity and queue kind;
- an occurrence-safe active identity and absolute logical position;
- total size when Plex provides it;
- known first and last boundaries;
- bounded pages or season segments;
- semantic operations to resolve adjacent items and load a window.

Media identity and queue occurrence identity are separate. A repeated playlist
item may share metadata with another record, but it must retain a distinct
occurrence, focus position, artwork binding, and playback return target.

Series, playlist, and collection providers implement one small sequence
contract. Player controls and the drawer do not depend on the origin-specific
loading strategy.

## Origin Providers

### Series

A series queue has one immutable scope selected by the first media opened:

- starting from a regular season creates a regular-only sequence;
- starting from Specials creates a Specials-only sequence.

Specials never enter Previous, Next, Up Next, drawer, or prefetch navigation for
a regular queue. A Specials queue never crosses into regular seasons.

Regular seasons are ordered by their Plex season number, not by array position.
Empty or non-playable segments are skipped while resolving the next playable
occurrence.

The drawer addresses the scoped series as one absolute logical sequence. Season
`leafCount` values provide lightweight segment descriptors; opening or moving the
drawer loads only the season segments intersecting the requested retained and SD
windows. The current season remains immediately available, while distant seasons
are resolved on demand without rebuilding the complete series queue.
When a loaded segment contains fewer playable records than its declared `leafCount`,
the requested window is rebased against the updated playable counts before it is
published. Direct absolute-position resolution follows the same stabilization rule,
so a drawer activation cannot disappear or select another episode after an earlier
segment count changes. Stabilization reuses resident segment data and must not repeat
Plex I/O.

A discontinuity in season or episode numbering does not start playback
automatically. The provider returns `confirmation-required` with one consolidated
description of the missing interval and the first playable target after it. A
combined season-and-episode discontinuity produces one confirmation, not a
chain of dialogs.

### Playlist

The playlist provider uses Plex container pagination and preserves exact server
order, including repeated items. Occurrence identity includes the origin and
absolute logical position, so duplicate rating keys remain independently
addressable.

Direct playlist playback scans pages only until it finds the first unfinished
playable occurrence. It does not hydrate the complete playlist before playback.

### Collection

The collection provider uses the same paginated container mechanism and
preserves the order returned by Plex. It does not apply series gap semantics.

### Sequence Stability

A loaded container page or series segment stores a lightweight fingerprint of its
ordered media identities. If an evicted unit later reloads with a different
sequence during the same queue generation, the provider rejects that response
instead of silently remapping occurrences beneath the active playback session.
A conclusively short page establishes a monotonic terminal boundary. Concurrent
responses beyond that boundary are ignored and discarded even when they arrive
first or still advertise the previous larger total. Synchronous transport throws,
malformed item containers, and oversized pages fail through the asynchronous
provider contract, release their request owner, leave no cache residue, and remain
retryable.

## Bounded Cache

The cache has independent limits:

- metadata: five pages of 40 lightweight records, maximum 200;
- DOM: visible viewport plus up to three viewports before and after;
- SD artwork: retained DOM window plus one directional prefetch viewport;
- final artwork: visible items plus three items immediately before and after.

Eviction preserves only lightweight logical positions, page descriptors, known
boundaries, and page fingerprints. Descriptors must not retain complete response
objects, DOM nodes, image objects, or closures over page data.

Browser image caching may help, but correctness and memory bounds do not depend
on browser eviction. Artwork requests use the rendered box size and never ask
Plex for a larger result.

## Responsive Drawer Rendering

The drawer is virtualized and opens on the currently playing occurrence. It
supports remote arrows, wheel navigation, and pointer input.

The render path:

1. computes a pure retained/visible/artwork window;
2. requests provider data by page rather than occurrence-by-occurrence;
3. reuses retained cards by occurrence identity;
4. reconciles only nodes that enter, leave, or change position;
5. avoids rewriting unchanged text, classes, attributes, and image sources;
6. cancels image work only for nodes actually evicted;
7. prefetches SD artwork outside the DOM without adding cards.

An unchanged retained window performs no list mutations. Moving the window by one
item removes the expired edge node and inserts the new edge node without detaching
or reordering the retained cards. Focus updates walk the retained-card identity
map directly, avoiding repeated selector queries over the drawer subtree.
Concurrent requests for the same provider window may share I/O, but a presentation
token allows only the latest drawer render to touch the DOM.

Fast directional scrolling changes priority without expanding hard bounds.
Direction reversal uses hysteresis to avoid repeatedly aborting and re-requesting
opposite windows.

## Previous, Next, And Confirmation

Each direction has one of four states:

- `available`;
- `unavailable`;
- `resolving`;
- `confirmation-required`.

Known absolute boundaries return `unavailable` synchronously. Repeated activation
of the same direction while resolving does not replace the owning request, enqueue
playback, or automatically start a target when the response arrives. Previous and
Next retain independent request ownership when both boundaries resolve concurrently.

A gap confirmation keeps the current playback and source untouched. The dialog
shows the first playable target after the unavailable interval, with neutral
artwork fallback, and defaults focus to staying on the current media. Only an
explicit confirmation passes the already-resolved occurrence to queue playback.
Cancel, seek invalidation, queue-generation change, closing Player, or selecting
a different origin invalidates the pending confirmation. The first visible
confirmation owns the decision until it closes; later adjacent results cannot
replace it. Queue replacement dismisses it immediately, and closing the dialog
releases its retained artwork. A current-episode change inside the same series
origin invalidates decisions owned by the previous occurrence without discarding
season metadata that completed safely.

Errors restore a retryable control state, display a non-blocking message, and
never close Player or replace the source with an invalid item.

## Up Next

Up Next consumes the same generic adjacent resolver as manual Previous/Next.
It may resolve and prefetch presentation data in advance, but it never changes
native playback until autoplay is confirmed.

When resolution encounters a series gap, countdown/autoplay is suspended and
the shared confirmation dialog is shown. A cancelled automatic crossing remains
cancelled for the current media; a later manual action may request confirmation
again. Seeking at least five seconds away from the end invalidates a pending automatic
resolution or visible countdown, while preserving the resolved provider state for a
fresh manual action or later native end.

## Lifecycle And Concurrency

Every queue request belongs to a generation and, where the origin remains the
same, to the current occurrence that requested the decision. Switching origin,
closing playback, starting another logical queue, or changing the current
occurrence invalidates older page-decision, metadata, artwork, adjacent, and
confirmation work. Late responses cannot alter:

- active occurrence;
- drawer focus or window;
- control availability;
- pending confirmation;
- Player source.

The cache survives ordinary control visibility changes and drawer open/close,
but is cleared when the logical origin changes.

## Performance Rules

Queue input paths read each required snapshot once per event. Drawer-state events
reuse the queue and current index already supplied by the controller, carry an
explicit lightweight queue summary with no resident `items` field, and an open
drawer reads detail state only once for rendering and focus. The delayed focus-ready
notification re-reads the live playback occurrence instead of retaining an animation-
start snapshot. Inactive feature
snapshots must not be queried from Home or unrelated views.

Provider windows are loaded by page, retained cards are reused, identical image
requests are not restarted, and direct start stops scanning as soon as its target
is known. These rules are required for perceived responsiveness on Chrome 53 and
LG webOS, not optional micro-optimizations.

## Compatibility

The implementation remains ECMAScript 5 compatible. `PlaybackController` keeps
exclusive ownership of play, pause, resume, seek, source replacement, rebuild,
recovery, timeline reporting, versions, tracks, and subtitle offsets.

`app/app.js` remains the single TV runtime bundle and is generated only through
`scripts/build-app.js`.

## Automated Coverage

Tests cover:

- Previous/Next within and across regular seasons;
- complete isolation of regular and Specials scopes;
- missing season, missing episode, and consolidated combined confirmation;
- first and last boundaries for series, playlists, and collections;
- thousands of logical items with bounded peak metadata, DOM, and artwork;
- repeated playlist entries and occurrence-stable focus;
- fast forward/backward drawer scrolling and direction reversal;
- page eviction followed by reverse navigation;
- changed server order after page eviction;
- delayed, failed, aborted, duplicate, and stale responses;
- playback remaining active after adjacent resolution failure;
- Up Next using the same resolver and confirmation path;
- hot-path snapshot and DOM-write budgets.

Existing playback invariant tests remain unchanged and must continue to pass.

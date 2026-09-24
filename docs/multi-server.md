# Multi-server Plex behavior

This document describes the current multi-server behavior shipped by Ploff. It is a
runtime reference, not a migration plan.

## Server inventory and connection selection

A linked Plex account can expose the primary PMS plus owned secondary and shared
`owned=false` servers. Each server keeps its own machine identifier, access token,
connection routes, and library section identities. Opening content from another PMS
does not replace the persisted primary server.

Plex account resources retain route metadata (`local`, direct remote, or `relay`).
Every candidate route is verified through unauthenticated `/identity`; the returned
`machineIdentifier` must match the expected PMS before Ploff can use that endpoint.
Tokens are never sent to an endpoint merely to discover whether it is the expected
server.

When the viewer explicitly selects a Plex server, Ploff probes the known local,
direct, and Relay routes in parallel to avoid serial timeout cost. Selection remains
quality-aware:

1. local route;
2. direct remote route;
3. Plex Relay.

A valid lower-quality result is retained while any higher-quality route is still
pending. As soon as the best still-possible class has been decided, Ploff commits that
single route and cancels the remaining probes. This is intentionally different from
normal runtime failover, which keeps the existing bounded ordered recovery policy.

## Libraries and navigation

Libraries from every enabled PMS may appear as normal navigation tabs. Secondary
libraries default to `<library> · <server>` so equal section names remain
unambiguous. Visibility, aliases, icons, server aliases, and source-aware ordering are
retained independently from transient server availability.

`aggregateLibraries` is optional and defaults off. When enabled, libraries with the
same displayed name and Plex library type across servers are presented as one virtual
tab. The tab fans out only to its member sources, merges/deduplicates the resulting
media, and retains source variants so Detail and Player can still choose a concrete
PMS correctly.

Library customization also accepts an optional **Merge group**. The same group and
library type combine sources in both navigation and Home, independently of their
display aliases; an empty group preserves grouping by displayed library name.
Virtual filters translate each displayed option to its member library's local Plex
identifier. A member without that option is excluded rather than queried with
another server's identifier.

The activity monitor stays yellow after a confirmed enabled-source failure and lists
the affected server or library. Pending discovery is not a failure. Successful retries
clear the corresponding warning; disabled sources are omitted.
Failed virtual-library members retain their cursor for a later page request. Newly
received batches are merged into the sorted unseen results, keeping already delivered
positions stable. After recovery, refresh the library to restore global ordering.
Sessions still retain accumulated results (at most four sessions), not bounded-size
streaming buffers.
Virtual page sessions and tab-prefetch results are keyed by the ordered member-source
list. A changed merge definition cannot reuse a page cursor or ready tab result from
the old definition. Source-availability changes and explicit refresh invalidate only
the affected library's ready tab results; unrelated libraries remain cached. Broad
content mutations and profile reset still clear all tab results because their scope
is not limited to one library. Do not prune server-specific cards from an already
merged page in place: source variants, sort order, and page cursors must be rebuilt
from the still-available members.

## Home

Once the viewer navigates, background arrivals preserve existing row/card positions
and append new entries. Known copies and availability may still update in place.
The next Home entry or explicit refresh restores normal ordering; late Continue
Watching content never steals focus after navigation begins.

Cached cards from an offline server remain in place. A `⊘` marker and accessible
unavailable label identify titles with no known online copy; titles with an enabled
online alternate remain unmarked. Pending discovery is not classified as offline.
Recovery clears the marker on recomposition. Opening a title continues to use the
existing source resolver and unavailable-message flow; no offline route is played.

Home becomes usable from the primary PMS first. As soon as the primary navigation/library list is available, secondary PMS discovery starts in parallel with the remaining primary Home work. Secondary Home data then arrives progressively; a slow or unavailable secondary server does not hold the first Home paint or block faster servers from contributing.
If the primary PMS fails, already-started secondary Home requests receive the normal
short discovery grace window. If at least one secondary returns usable Home content,
Ploff shows that degraded Home and warns that the primary is unavailable, offering to
continue temporarily or open the existing server selector. This never promotes the
secondary PMS to the persisted primary server.

Current cross-server behavior is:

- Continue Watching is merged across enabled servers and ordered by recent activity;
- Recommended is merged across enabled servers using the existing ranked merge;
- Recently Added remains one row per source library by default;
- `aggregateHomeLibraries`, optional and off by default, combines the Home presentation
  of matching libraries across PMS instances: matching Recently Added rows merge and
  their Home source badges omit the server suffix;
- disabled servers do not contribute content while their saved presentation
  preferences remain available for later re-enable.

The Home navigation item itself remains fixed and always visible. That navigation rule
must not be confused with the origin of the rows displayed inside Home.

## Search and global content

Search fans out across enabled reachable PMS contexts and merges the successful
results. A failing secondary source does not discard successful results from the other
servers. Media identity and deduplication remain server-aware; semantically equivalent
copies retain their concrete source variants rather than losing route ownership.

Watchlist and global playlist resolution use the same source-aware server contexts when
they need to resolve a Plex GUID to a concrete media item.

## Media source ownership

Multi-server browsing produces logical media that may contain more than one concrete
copy. The current `item + sourceVariants` representation is resolved at use time by
`MediaSourceResolver`; `PlexSourceRouter` still routes one already-concrete copy.
Persistent PMS preference, video/audio/subtitle ranking, and playback-queue occurrence
identity remain separate concerns.

See [`multi-server-source-resolution.md`](multi-server-source-resolution.md) for the
resolver contract and the architectural audit behind that boundary.

## Detail episode versions across servers

Episode merging uses GUID identity before season/episode numbering. Conflicting GUIDs
remain separate; records without a GUID fall back to season and episode numbers.
The numeric fallback requires both records to lack a GUID; mixed identified/unidentified
copies remain separate rather than guessing. Equal GUIDs still match different numbering.
Incomplete unidentified records remain scoped to their owning PMS.

When matching TV libraries are aggregated, an episode can have playable copies on more than one PMS.
The Detail keeps those copies as concrete `sourceVariants` and the Version row/browser presents the
available PMS copies without losing the owning server, `ratingKey`, season context, or source preference.
External copies are labelled with their server alias/name in the Version UI.

The current implementation avoids one metadata request per visible episode. Season `/children` responses
retain lightweight `Media/Part` information per concrete PMS copy. If the initially published episode list
does not yet contain the external variants, Detail performs one merged season recovery, propagates the
matching `sourceVariants` across the visible season, and reuses the lightweight profiles for version
presentation. The current episode profile and ASS fetch/cache candidate are prioritized before this speculative
season hydration, and concurrent version-hydration consumers share the same in-flight season request.
Full metadata/stream detail is still loaded only for the concrete episode/version that is actually selected.

A multi-server season is only a hint that an episode *may* have another PMS copy. Detail therefore reserves
the Version-arrow footprint while ownership is being hydrated, but lateral cycling is exposed only when
that specific episode has multiple playable versions. Those versions may be multiple Media/Part variants on the
same PMS or confirmed copies across PMSes. Newly confirmed arrows fade in using a short opacity-only transition,
so a single-version primary-only episode never receives false controls and the row does not jump when an external copy is discovered.

Changing the selected PMS copy of an episode does not reopen the series as a new Detail. The existing
series/season context and focus remain owned by the same Detail session, and late asynchronous responses
are generation-checked so an older source selection cannot overwrite the current one. A `ratingKey` is
never treated as globally unique across PMSes; source identity always includes PMS ownership.

This specific multi-server Version recovery was physically confirmed on the TV on 2026-09-21. Broader
physical validation (rapid episode/season movement, slow/offline secondary PMS, Player return, account
and aggregation-setting changes) remains tracked in `TODO-detail-versions-prefetch.md` and the release
signoff matrix.

## Settings

The two aggregation settings are independent:

- **Merge matching library tabs** (`aggregateLibraries`) affects navigation/library
  browsing;
- **Merge matching libraries on Home** (`aggregateHomeLibraries`) combines matching
  Recently Added rows and simplifies Home badges for homonymous libraries. Continue
  Watching and Recommended stay single cross-server rows in both modes.

Neither setting turns multi-server discovery on or off. Enabled secondary servers can
contribute to Home/Search even when both merge settings are disabled.

## Performance and lifecycle constraints

Multi-server work remains lazy and bounded. Ploff does not preload every external
catalog. Home exposes primary content first, secondary contributions arrive progressively, and an already-open matching library is reconciled as new members are discovered so it can begin using the expanded aggregate without requiring a leave/re-entry. Virtual-library content requests still fan out only when that virtual source is used.
Server disable/enable changes invalidate the relevant content state without changing
stored aliases/order or silently promoting a secondary PMS to primary.

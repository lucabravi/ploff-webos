> **Archived historical record.** This document describes a completed or superseded implementation phase. Do not use it as the current behavior reference; see `docs/README.md`.

# Multi-server global features - progress

## Temporary source outages

Known external libraries remain in navigation with an Offline label and dimmed
content when discovery or content requests fail. Selecting an offline source fails
immediately; discovery retries with the existing 5–60 second backoff and restores
normal navigation after successful section loading. Account-confirmed removals
still remove the tab. Availability is transient and is not saved as a preference.
Discovery/resolution and aggregated external content have a 10-second request
deadline; partial search results survive unavailable servers, with late callbacks
ignored and outstanding transport cancelled. Metadata and playlist-page requests
use the same deadline. Physical-TV validation is pending.

Checkpoint WIP based on `5340b3fb`.

Implemented and covered by targeted tests:
- shared multi-server media identity/dedupe helpers;
- reachable PMS registry/context reuse;
- multi-server Search fan-out/merge;
- cloud Watchlist GUID resolution across reachable PMS;
- aggregated Playlists with source-aware routing;
- merged Continue Watching ordered by activity timestamp;
- Recently Added rows retain library identity (`sectionKey`/`sectionTitle`);
- per-library `homeRecentEnabled` preference stored with library tab preferences, including external libraries;
- source-aware media context and Home watched/progress updates;
- composition root wiring and lifecycle ownership.

Targeted tests currently passing:
- multi-server media helpers;
- library source registry;
- multi-server content controller;
- Search multi-server ports;
- Plex Home multi-server metadata;
- library tab store/editor/settings;
- TV shell compatibility.

Final validation completed for this cycle:
- full `npm run verify` passes, including architecture, feature contracts, unit/browser checks, baseline, assets and LG UX;
- memory/lifecycle pre-release test passes with 0/200 weakly retained payloads and 0/100 retained runtime payloads;
- final heap sample shows +0.01 MiB net growth with ~0.00 MiB/sample slope;
- `git diff --check` passes.

## Startup responsiveness hardening

Implemented after checkpoint `a9d553c0`:
- cross-PMS media identity now scopes reused Plex `ratingKey` values by `serverMachineIdentifier` in Home/Search/Watchlist/presentation focus paths;
- theme metadata and media-context mutations route through the owning PMS;
- startup Home no longer waits for shared/external PMS discovery or Home responses;
- `LibrarySourcesController.primaryContext()` exposes the already-active primary transport synchronously, without account/server discovery;
- `MultiServerContentController.loadHome()` now fetches the primary PMS first and returns immediately, while retaining the last successful external Home enrichment for later primary refreshes;
- external Home content is refreshed lazily after a 350 ms quiet window and merged incrementally into Shell;
- the first Home presentation no longer starts a duplicate `librarySources.refresh()` immediately; external PMS discovery is owned by the same lazy enrichment path, so network/server discovery does not compete with the first Home paint;
- lazy external Home work is skipped if the user leaves Home or the document becomes hidden before the quiet window expires;
- repeated primary refreshes reuse the pending lazy enrichment instead of restarting its timer or network work;
- enrichment cancellation owns both discovery and external Home requests; cancelled operations are released immediately, and synchronous completions do not retain request handles;
- Continue Watching remains globally merged and activity-sorted after enrichment; Recently Added remains one row per library and retains per-library Home visibility settings.

Regression coverage added for:
- primary Home completing before any secondary Home request;
- external enrichment scheduling after first Home content;
- cached external rows remaining stable during later primary refreshes;
- cancellation/skip when Home is no longer active;
- identical `ratingKey` values from different PMSes remaining distinct.

# Catalog performance reference

This document is the current regression reference for Library catalog performance on
legacy LG webOS targets. It records the benchmark protocol, the retained historical
baseline, the current optimized result, and the invariants that future changes must
preserve.

## Benchmark command

```sh
npm run benchmark:library-catalog
```

The default workload uses 5,000 synthetic catalog items, one warm-up, seven measured
rounds, 5,000 integrated focus movements, 3,000 same-window scroll events, 1,500
row-boundary scroll events, and 100 appended pages of 60 records.

For the 10,000-item stress run:

```sh
PLOFF_CATALOG_ITEMS=10000 npm run benchmark:library-catalog
```

Deterministic operation counts are the primary regression signal. Wall-clock Node
measurements are useful for comparison, but they are not a substitute for physical-TV
validation.

## Retained benchmark artifacts

- `benchmarks/catalog-performance-baseline-3604d71.txt` — original pre-optimization
  baseline retained for historical comparison.
- `benchmarks/catalog-performance-static-cache.txt` — current default 5,000-item
  result, refreshed on Node v26.0.0.
- `benchmarks/catalog-performance-stress-10000.txt` — current 10,000-item stress
  result, refreshed on Node v26.0.0.

Intermediate implementation-tranche logs are intentionally not kept in the current
working tree. Git history remains the source for those historical checkpoints.

## Current deterministic budgets

The optimized catalog must preserve these hot-path properties:

- focus movement performs no DOM reconciliation and no poster work;
- scrolling inside the same virtual window performs no DOM mutation, query, or poster
  work;
- crossing one row changes only the entering/leaving row, with approximately five
  node moves, five artwork cancellations, five full-artwork promotions, and five
  preview jobs;
- ordinary page append performs no DOM or poster work while the retained window is
  unchanged;
- fixed card geometry uses cached profiles instead of repeated DOM measurement;
- mounted-node and presentation caches remain bounded to the retained view;
- three-row overscan, focus identity, raw Plex pagination offsets, and restoration
  semantics remain unchanged.

## Executable operation ceilings

`tests/test-library-grid-hot-paths.js` consumes the same `OPERATION_BUDGETS` exported by
`scripts/benchmark-library-catalog.js`. Focus movement is capped at two local queries, four
layout reads and zero DOM/poster/media rebuild work. A one-row boundary transition is capped
at 5.2 node moves, 5.1 removals/cancellations, 10.2 artwork jobs and 5.2 full/preview jobs.
The fractional headroom also covers the benchmark's averaged warm-state transitions without
turning wall-clock timings into CI gates. `npm run benchmark:library-catalog` exits non-zero
when either guarded scenario exceeds these deterministic ceilings.

## Current reference measurements

Node v26.0.0, 5,000 items, seven measured rounds:

| Scenario | Current median | Key operation budget |
|---|---:|---|
| Focus movement | 10.633 ms / 5,000 | 0 DOM mutation, 0 poster work, 2 local queries |
| Same-window scroll | 0.819 ms / 3,000 | 0 DOM/query/poster work |
| Row-boundary scroll | 44.003 ms / 1,500 | ~5 node moves, ~10 artwork jobs |
| Append pages | 0.995 ms / 100 | 0 DOM/poster work while window is stable |

Node v26.0.0, 10,000 items, seven measured rounds:

| Scenario | Stress median | Key operation budget |
|---|---:|---|
| Focus movement | 10.087 ms / 5,000 | same bounded operations as 5,000 items |
| Same-window scroll | 1.204 ms / 3,000 | same bounded operations as 5,000 items |
| Row-boundary scroll | 43.067 ms / 1,500 | same bounded row reconciliation |
| Append pages | 0.666 ms / 100 | same stable-window behavior |

The similar deterministic counts at 5,000 and 10,000 items are more important than
small timing differences between runs.

## Historical baseline

The retained baseline (`3604d71`, Node v22.16.0) recorded approximately:

- 1,287.986 ms / 5,000 integrated focus movements;
- 501.387 ms / 3,000 same-window scroll events;
- 1,209.415 ms / 1,500 row-boundary events;
- 20.658 ms / 100 page appends.

The current implementation replaces full-window reconciliation on hot paths with
bounded mounted-node updates, cached card profiles, incremental page append, and
tiered artwork ownership.

## Predictive background loading

Browsing surfaces deliberately warm likely next actions without making loading
progress visible to the user. The policy stays inside the feature that owns each
surface rather than introducing a global background scheduler:

- Watchlist keeps the complete resolved model in memory but mounts only a bounded,
  focus-centred row window. Its background warm-up begins after the first Home is
  usable, while navigation intent can still bring it forward sooner.
- Adjacent Library prefetch caches recommendation data only. Detached presentation
  DOM and artwork are deferred until the existing navigation-entry path actually
  prepares that library.
- Home still renders its rows as a complete surface. The first rows request full
  artwork immediately; deeper rows begin with previews and are promoted as focus
  approaches, avoiding visible progressive row hydration.
- Scheduled Home refresh transport remains active in the background, but changed
  rows wait for a short input quiet period before replacing visible Home DOM.
- Detail season and episode previews keep only the latest in-flight preview intent;
  superseded Plex requests are aborted while non-preview Detail requests retain
  their existing ownership and lifecycle.

These rules optimize CPU, image decoding, DOM work, and stale network parsing while
preserving the TV-first perception that the next likely surface is already ready.

## Bounded catalog reconciliation after Detail/Player

The regular Library catalog keeps a continuous resident prefix of Plex results in memory,
loaded in 60-item pages. A watched/progress mutation that occurs while Detail or Player owns
the screen must not rebuild that prefix from offset zero merely to make the return position
authoritative.

Before leaving a catalog card, Library records a lightweight focus anchor containing the
card's Plex `ratingKey`, its numeric UI index, its absolute raw Plex source offset, the containing
60-item raw block start, and the active library/sort/filter query identity. If source-offset metadata
is unavailable, the numeric UI index remains the compatibility fallback. If content becomes dirty
while Library is hidden, return reconciliation follows these rules:

- if the same catalog query is still active, request only the anchored 60-item raw Plex window;
- merge that authoritative window by raw source-offset range and de-duplicate the preserved suffix
  by stable media identity;
- keep incremental pagination in raw Plex coordinates, advancing to the furthest consumed raw
  `nextStart` even when local filtering makes the visible resident list shorter;
- restore focus to the same `ratingKey` when it still exists; if it left the filtered result,
  clamp the previous numeric UI index to the new resident list;
- retain dirty state and the anchor when the bounded request fails so the next return can retry;
- if the query identity changed, or the active surface is Recommended/Continue/Recent rather
  than the regular catalog, use the existing authoritative replacement path instead;
- playlist/collection detail keeps its separate container-summary reconciliation contract.

For the regular catalog's **Unwatched** filter, Ploff applies a final semantic correction after
Plex responds: any item whose already-returned metadata canonically says `viewed === true` is removed
locally. For shows/seasons this means `leafCount > 0 && viewedLeafCount >= leafCount`; no additional
Plex request is required. The page's continuation offset still advances by every raw Plex row. If an
intermediate raw page is entirely rejected, Library immediately continues from the next raw offset;
when the terminal raw page is reached, the visible total collapses to the actual accepted-card count.
This prevents false empty states, duplicate/skip errors, and infinite lazy-load attempts while keeping
network cost bounded to the normal 60-row page size.

This keeps network and Plex parsing cost constant with catalog depth: returning from an item at
index 60 or index 1,160 requests the same maximum 60 records. The local merge is linear only in
the already-resident array of object references and does not alter the bounded DOM virtualization
or artwork ownership model.

## Required validation after catalog changes

Run the benchmark whenever a change affects Library/Watchlist virtualization, card
layout, progressive artwork, pagination, focus movement, or mounted-node ownership.
Then run:

```sh
npm run verify
npm run test:memory
git diff --check
```

Physical-TV validation should cover sustained directional navigation, rapid Magic
Remote wheel scrolling and direction reversal, page-boundary crossings, preview to
full-artwork promotion, poster-size changes, restoration after reopening Library, and
long-running memory/image stability.

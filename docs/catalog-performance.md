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

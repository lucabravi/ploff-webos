# Multi-server source resolution

## Audit and decision (2026-09-14)

Baseline: `develop`, `77071f5b3636ede36783a9549d5de2feedd07722`.
The supplied archive SHA-256 is
`73ff770d96fb75dc4705f4637f46fa3172f8755ae54ada2a094a824a95c1e9ab`.
This decision is grounded in that repository, not another checkout. The current
request authorizes both the architectural decision and its implementation.

### Diagnosis

The data model is not the main source of complexity. An item has a current PMS
owner plus `sourceVariants`; pure projection already exists in `MultiServerMedia`.
The problem is repeated interpretation of that model at use-case boundaries.
Application's `routeableSourceVariant`, Content's `routeableMediaTarget`, Player's
`routeableQueueItem` and Detail's preference/availability helpers independently
answer which concrete copy can be used. Player additionally duplicates projection
in `itemForSourceVariant`. These implementations do not even have identical
ordering: Player preserves the owner and uses session affinity only on fallback,
whereas Detail first considers a persisted preference and may rank profiles.

The dangerous split is an item from B accompanied by config, metadata or artwork
context from A. Moving only `routeFor()` calls would not remove this failure mode.
Resolution must return the concrete item and its route as one result; consumers
must not retain the old ratingKey or use the session config after resolution fails.

### Responsibility map

| Concern | Baseline owner | Decision |
| --- | --- | --- |
| Discovery, enabled state, context registry, refresh | LibrarySourcesController / server owners | Keep |
| Validate and route one concrete PMS copy | PlexSourceRouter | Keep, including explicit-context and empty-token semantics |
| Decorate, deduplicate, retain variants, project a copy | MultiServerMedia | Keep pure; remove Player's duplicate projection |
| Choose a routeable copy | Application, Content, Detail, Player | One MediaSourceResolver |
| Persist semantic-GUID PMS preference | MediaSourcePreference, invoked by Detail | Keep; preference is resolver input |
| Rank video versions/audio/subtitles | Detail, MediaPreferences, VersionSelection | Keep outside resolver |
| Queue occurrence, paging, position, gaps | PlaybackQueueController and providers | Keep; do not mutate logical occurrence identity |
| Queue drawer, images and focus | PlayerQueueController | Keep; consume Player's resolved presentation port |
| Playback session transport | PlayerFeatureController | Keep, scoped to the selected copy, never global primary config |
| Home invalidation/order/server lifecycle | Existing source/catalog/content owners | Keep existing bounded lifecycle and acceptance tests |

Concrete routing is deliberately still legal in feature code when operating on
an already-selected item. A config-only helper must NOT silently select another
variant while its caller continues using the old ratingKey. Resolving a logical
item and routing an already-concrete item are distinct contracts.

### Alternatives

**A. Keep four fallback policies.** Lowest edit risk, but each new invariant still
requires changes across presentation and playback. Existing duplicated loops and
projection are domain-independent; leaving them distributed is not justified.

**B. One narrow resolver, existing media model. Chosen.** Adds one stateless
capability and removes four independent variant-selection implementations. The
single-server path stays one router call; multi-server work remains bounded by
variants already attached to the item. Migration is local and reversible.

**C. Replace items with LogicalMedia/sources.** Removes the canonical-owner shape,
but requires adapters throughout Home, Search, Library, Detail, mutations, artwork,
queues and playback. The reviewed failures need late resolution, not a catalog
schema migration. It would add more concepts and migration risk than it removes.

**D. Make PlexSourceRouter choose variants.** Fewer module names but an ambiguous
contract: callers asking for config could silently obtain A's token while still
using B's ratingKey. Keep the concrete router fail-closed instead.

## Contract

`MediaSourceResolver.create({ sourceRouter })` receives the existing concrete
router. Its only other dependency is the pure `MultiServerMedia` module.

```js
resolver.resolve(item, {
  preferredMachine: 'server-b', // optional intent, read by the caller
  candidateContext: context   // optional concrete context / fallback affinity
}); // -> { item: concreteItem, route: { context, config, identity }, fallback } | null

resolver.available(item, { candidateContext: context });
// -> routeable results; no network, no profile loads, no persistent state
```

Selection order is explicit and shared: a known preferred PMS, the current owner,
then the candidate-context PMS as fallback affinity, then remaining variants in
stable order. A preference not represented by the item is ignored. Session
affinity never steals an item from a routeable owner. `fallback` on `resolve()`
means that the known preferred copy (or otherwise the current owner) could not be
used. Detail may respond by ranking the available copies; the resolver does not
interpret codecs, languages, media versions or UI settings.

`available()` uses the same traversal. Duplicate concrete identities are visited
once. Malformed variants must not borrow the owner's ratingKey. The existing
pure projection accepts an optional ratingKey discriminator so copies on the
same PMS retain their exact identity; two-argument calls remain compatible.
Resolution does not mutate the input item or discard its complete variant list.

`null` is authoritative. Metadata/playback fail closed; artwork/prefetch do no
work rather than pair an unresolved item with primary/session credentials.
Results are short-lived, never cached by the resolver. Call again at an action
boundary after enable/disable, context refresh, or a deferred callback.

## Consumer changes

Application consumes resolution for the media context and its entry preflight;
it forwards the original logical item to Detail so Continue Watching provenance
and Detail quality selection are not lost. Content uses a resolved item/route for
metadata. Player consumes the same resolver for queue metadata, activation,
Prev/Next, Up Next, drawer presentation, and artwork; session-affinity ordering
is an input, not another selection loop. Detail replaces preference/availability
loops with `resolve`/`available`, but keeps profile request lifecycle and ranking.
Explicit source/version changes are revalidated at confirmation and only then
persisted; an automatic fallback never writes a new PMS preference.

No queue provider or presentation owner gains discovery or resolver state.
No renderer, native playback, subtitle, libass or worker implementation changes.

## Acceptance and performance

The authoritative regression suite remains in place: server lifecycle and restore,
Home/Search/Watchlist/cache invalidation, hidden ordering, distributed series,
source preferences, queue occurrence identity, playback and teardown tests.
Focused additions exercise: stale B+[B,A], all unavailable, B disabled/re-enabled
using the same resolver, current-context tokens, explicit empty tokens, owner-first
session affinity, unknown preferences, exact-copy identity, invalid variants,
input immutability, and a single router call with no projection on single-server
resolution. Consumer tests prove that the resolved ratingKey, config and image
context travel together and unavailable artwork cannot use another PMS.

The resolver performs no discovery, network, profile load, timers, persistence,
preload or cache invalidation. It has no global singleton and no lifecycle state.
Full `npm run verify`, `npm run test:memory`, `git diff --check` and
`git fsck --no-dangling` are release evidence, not physical-LG signoff.

## Projection completeness found during migration

A regression fixture confirmed that selecting a sparse A variant retained B's
image, artwork, sourceId, library section and server label. Routing A correctly
is insufficient when projected fields still describe B. The pure projection now
overwrites its existing source-specific fields, including empty values, rather
than borrowing them from another copy. Logical title/GUID and all variants remain
intact. This is one correction at the existing pure boundary, not new fallback
exceptions in the consumers. Metadata enrichment remains lazy.

## Incremental migration

1. Record this decision and the baseline verification.
2. Add resolver and pure projection discriminator with RED/GREEN contract tests.
3. Inject one resolver from Application and migrate Content/Player/Detail while
   preserving existing behavior and ranking tests; regenerate both bundles.
4. Enforce the architectural boundary, run final regressions, document measured
   changes, and package a clean checkpoint with `.git` and without `node_modules`.

See `cleanup/2026-09-14-multi-server-source-resolution-plan.md` for checkpoints.

## Complexity judgment

This reduces complexity only if the old loops disappear and every consumer uses
the resolved pair. Merely adding a resolver beside the old code would fail the
audit. A small increase in wiring is acceptable; a new manager, shared mutable
context, generic policy framework or catalog representation is not.


## Implemented outcome

The old variant-selection helpers have been deleted, not retained as a second
path. Application creates one resolver and injects it into Content, Detail and
the deferred Player. A maintainability AST rule permits consumption of
`selectSourceVariant` only in the resolver, keeps its definition in the pure media
module, and rejects the removed private picker implementations. Concrete
`routeFor` calls remain permitted for already-selected items. This guard is a
regression constraint, not a proof against every possible renamed algorithm.

Measurements against the supplied baseline, excluding generated bundles:

| Authored runtime | Baseline lines | Implemented lines | Difference |
| --- | ---: | ---: | ---: |
| ApplicationController | 2125 | 2098 | -27 |
| DetailFeatureController | 2420 | 2374 | -46 |
| MultiServerContentController | 1120 | 1103 | -17 |
| PlayerFeatureController | 3046 | 3008 | -38 |
| MediaSourceResolver (new) | 0 | 98 | +98 |
| MultiServerMedia | 249 | 252 | +3 |
| Total | 8960 | 8933 | -27 |

Direct concrete-router call sites in those four features plus the resolver fall
from 19 to 5 (Application 0, Content 0, Detail 1, Player 3, resolver 1). These are
static call-site counts, not runtime request counts. There is one production
consumer of pure source projection, and Player's independent projection is gone.
The main gain is one variant-selection owner rather than four, not a dramatic
line-count reduction. Tests, documentation and wiring intentionally make the full
patch larger than this runtime delta.

Generated-bundle measurements from the existing performance gate (gzip level 9):

| Bundle | Baseline raw / gzip bytes | Implemented raw / gzip bytes |
| --- | ---: | ---: |
| Core | 683962 / 135676 | 684093 / 135639 |
| Deferred Player | 462057 / 93396 | 460722 / 93037 |

Combined bundles shrink by 1204 raw bytes and 396 gzip bytes. Startup remains at
112 scripts; the gate's startup JavaScript total changes from 2051257 to 2051469
bytes (+212). No startup request, catalog preload, network call or discovery is
added by resolution. These measurements do not demonstrate a physical-TV speedup.
The single-server test proves one router call without variant enumeration;
multi-server traversal/projection is bounded by variants attached to this item.

## Regression evidence and limits

Each implementation checkpoint passed `npm run verify`, `npm run test:memory`,
`git diff --check` and `git fsck --no-dangling`. New resolver tests include 480
combinations of enabled servers, owner, stored preference and session affinity,
plus malformed/duplicate/exact identities, live context updates and immutability.
Existing lifecycle, merged-series, preferences, language/version selection, queue,
Home/Search, composition and teardown suites remain enabled.

RED/GREEN evidence was also recorded for unavailable queue artwork/prefetch,
cached Detail choices after disabling a server, sparse source-field projection,
shared resolver composition and the architectural ownership guard. For the two
consumer regressions, the new tests were run against the pre-migration controller
and failed on the intended assertions before restoring the implementation.

No dependency, persisted schema, budget, CSS, source registry, concrete router,
preference storage, queue model/provider, subtitle renderer, libass or worker
implementation was changed. The Player feature file changes routing/presentation
helpers, not subtitle runtime or playback transport algorithms. Generated bundles
were rebuilt with `npm run build:app` and their freshness gates remain in place.

The automated tests use controlled PMS contexts; this work does not claim live
Plex end-to-end or physical LG/Chrome 53 validation. The ES5, LG UX and performance
gates are static checks, not substitutes for a real device. A final acceptance on
hardware should cover A+B playback, disabling B while a queue/details view is
already open, Up Next/Prev/Next imagery, re-enabling a preferred B, distributed
series, an empty-token PMS, and the unchanged ASS playback smoke test.


Final automated gate run: PASS (`verify`, 256 unit-test files plus shell baseline,
`test:memory`, diff whitespace and Git object integrity). The memory harness ran
400 cycles per sample over six samples: retained payloads 0/200, retained runtime
payloads 0/100, net heap growth 0.05 MiB, slope 0.01 MiB per sample. These are
harness measurements, not a general leak-free proof.

A separate baseline comparison found all 19 subtitle/ASS/worker-related runtime
files, eight existing routing/queue/settings/dependency boundaries, and 22 named
subtitle/ASS/worker-related function bodies in the modified controllers unchanged.
The release archive includes Git history and excludes installed dependencies.

# Composition and Compatibility Cleanup Phase 4 Inventory

Baseline commit: `540226fe` (`Complete detail cleanup phase three`)

## Scope

Phase 4 follows the consumer-driven pruning rule from `codebase-cleanup-design.md`. A large file or a test-visible helper is not dead merely because production features do not call it directly. Internal Plex helpers remain valid when consumed inside `PlexClient`; public compatibility exports are candidates only when their external contract has no production consumer and no remaining practical compatibility value.

## Baseline metrics

- `app/coordinator/application-controller.js`: 1769 lines, 100980 bytes.
- `app/plex-client.js`: 1833 lines, 76466 bytes.
- `app/coordinator/plex-feature-ports.js`: reviewed production capability selector; explicit per-feature allowlists retained.
- generated `app/app.js`: 899405 raw bytes at the Phase 3 checkpoint, below the behavior baseline 899972 and hard budget 900000.

## Plex feature-port ownership

Production feature ports intentionally expose only the methods each feature consumes:

- server: account/profile, activities, navigation, server identity;
- shell: home, metadata, poster URL;
- search: GUID lookup and search;
- library: library paging/filter/recommendation/refresh/metadata refresh;
- detail: extras, media profile, metadata, season/series context, refresh, watched/reset;
- media context: continue-watching removal, reset progress, watched/reset;
- player: playback/metadata/season/subtitles/transcode/timeline/stream selection/subtitle offset.

No dead `PlexFeaturePorts` capability has been identified at baseline.

## PlexClient compatibility classification

### Proven obsolete

`refreshMetadataSequence(config, ratingKeys, callback)` is Class A:

- no production consumer references it;
- `DetailFeatureController` no longer delegates hierarchy refresh to it;
- `tests/test-tv-shell.js` explicitly guards against reintroducing that opaque sequence path;
- only `tests/test-plex-client.js` directly invokes it and lists it on the reviewed facade;
- current Detail behavior owns explicit refresh sequencing and therefore does not depend on this compatibility helper.

Task 2 may remove both the public export and implementation while retaining single-item `refreshMetadata()`.

### Internal but test-visible — not proven dead

URL builders, XML/media mappers, option resolvers and parsing helpers may have no external production call site because they are consumed internally by other `PlexClient` methods. They are not deletion candidates merely from an external-consumer scan. Their exports will be reviewed individually in Task 3; coverage must move to a semantic production owner/module before an export is removed.

Remaining examples include refresh/progress URL builders, `resolvePlaybackOptions`, `parseAttributes`, and recommendation/navigation definition helpers. Playback source/decision URL ownership has moved to `plex-playback-urls.js`; the old `PlexClient` exports were removed.

## Application composition classification

`ApplicationController` remains intentionally explicit. Its visible dependency maps are not duplication by themselves. Phase 4 will remove only zero-consumer callbacks/dependencies, stale aliases, or duplicate registration/teardown proven superseded by current lifecycle helpers.

No ApplicationController deletion candidate is accepted until its call sites and source/lifecycle contracts are characterized.

## Task 2 result

`refreshMetadataSequence` was removed from both implementation and reviewed `PlexClient` public surface after a contract RED proved the old export was still present. Its historical direct sequence test was removed, while current single-item metadata refresh coverage and the TV-shell prohibition against the obsolete Detail path remain. `app/plex-client.js` shrank by 511 bytes; generated `app/app.js` is unchanged because PlexClient is packaged as a separate runtime asset.

## Task 3 module-owner facade pruning

The reviewed `PlexClient` compatibility surface no longer re-exports pure helpers that already have a
semantic owner. Removed facade aliases are:

- `PlexUrl`: `buildUrl`;
- `PlexPlaybackUrls`: `playbackModeFromDecisions`, `buildStreamSelectionUrl`,
  `buildSubtitleStreamUrl`, `buildSubtitleTranscodeUrl`, `buildSubtitleOffsetUrl`;
- `PlexMediaMapper`: `mediaFromAttributes`, `containerFromAttributes`, `groupRecentAttributes`,
  `detailFromAttributes`, `episodeFromAttributes`, `preferredSeasonKeyFromAttributes`;
- `PlexMediaDocument`: `attributesFromNode`;
- `MediaProfile`: `trackFromAttributes`.

Production had zero `PlexClient.<helper>` consumers for this family. Tests now target the owning modules
instead of preserving the old monolithic facade. The helper implementations and all runtime call paths
remain unchanged.

The remaining test-visible-only `PlexClient` exports are being reviewed separately. An internal helper is
not removed merely because feature ports do not call it; it may remain internal while its public export is
narrowed only when tests can preserve the behavior through a stable semantic owner or production API.

### Playback URL ownership

`hlsUrlFor`, `directUrlFor`, selected-version resolution, `buildPlaybackUrl`, and `buildDecisionUrl`
were moved from `PlexClient` to the already-loaded `plex-playback-urls.js` owner. `PlexClient` retains only
private aliases needed by `loadPlayback()`/`preparePlayback()` and no longer publishes playback URL builders
on its compatibility facade. Direct URL assertions now target `PlexPlaybackUrls`.

### Library and mutation URL ownership

`buildLibraryBrowseUrl`, watched/unwatched, continue-watching removal, progress reset, library refresh,
and metadata refresh URL construction moved into the already-loaded `plex-url.js` owner. `PlexClient`
uses private aliases for its request operations and no longer republishes those builders. This preserves
endpoint behavior while separating pure URL construction from XHR lifecycle/callback policy.

### Playback record mapping ownership

Chapter records, intro/credits marker records, playback session records, and media-version records moved
from `PlexClient` to `plex-media-mapper.js`. The mapper depends only on the already-earlier-loaded
`MediaProfile` owner for stream/profile normalization and stays transport-free: `PlexClient.loadPlayback()`
attaches `sourceUrl`/`hlsUrl` immediately after mapping through `PlexPlaybackUrls`. No startup reorder or
dependency cycle was introduced. `PlexClient` retains private mapper aliases only where request assembly
needs them and no longer exposes `playbackFromAttributes` as a compatibility API.

### Playback option ownership

`normalizePlaybackOptionPreferences`, option materialization, and `resolvePlaybackOptions` moved from
`PlexClient` to `MediaPreferences`. `loadPlayback()` consumes the preference owner through a private alias;
Detail/playback characterization tests now use `MediaPreferences` directly, and the old compatibility export
was removed.

### Generic XML item parsing ownership

Top-level `Video`/`Directory`/`Playlist` attribute extraction moved from `PlexClient` to `plex-media-document.js`. Real-container and extras fixture tests now consume `PlexMediaDocument.parseAttributes()` directly, so generic XML parsing no longer requires the transport client facade. `PlexClient` retains only private aliases for request flows and no longer exports `parseAttributes`.

### Home and recommendation shaping ownership

Home row definitions and pure Plex recommendation shaping now live in the dedicated
`plex-home-model.js` owner. `PlexHomeModel` owns `sectionDefinitions`, `homeDefinitions`, recommendation
hub priority/filtering, recommendation XML row/item mapping, and deterministic round-robin merging. It
depends only on `PlexMediaDocument` and `PlexMediaMapper`, while `PlexClient` retains recommendation XHR,
cache/LRU, concurrency and callback/error ownership and consumes the Home model through private aliases.

The dedicated owner adds one local development startup script (128 -> 129). The cleanup no longer freezes
the exact startup-script baseline: a cohesive module may add a script when the dependency boundary is
meaningful, provided the configurable startup fan-out and aggregate-byte guardrails still pass. The old
Home/recommendation `PlexClient` facade exports remain removed; direct tests target `PlexHomeModel`.
TV-shell source contracts follow the semantic owners for playback resume mapping and Direct Stream URL
policy instead of searching stale implementation text in `PlexClient`.

### Production-API coverage replacing helper exports

Four additional test-visible helper exports were removed after their behavior was characterized through
current production APIs:

- `activityIdFromResponse` is covered through `refreshLibraryMetadata()` returning the Plex activity id;
- `activityItemsFromJson` is covered through `loadActivities()`;
- `accountProfileFromJson` is covered through `loadAccountProfile()`;
- `navigationDefinitions` is covered through `loadNavigation()` using compatible library records plus the
  static navigation entries.

The underlying helper functions remain private where `PlexClient` still needs them. This narrows the
compatibility facade without deleting request/parsing behavior or weakening the semantic tests.

### Task 3 checkpoint metrics

At this checkpoint, before the remaining export matrix and `ApplicationController` audit are continued:

- `app/plex-client.js`: 1333 lines / 55552 bytes, down from the Phase 4 baseline 1833 lines / 76466 bytes;
- `app/plex-media-mapper.js`: 602 lines / 24717 bytes and limited to media-record mapping;
- `app/plex-home-model.js`: 162 lines / 6627 bytes and owns Home/recommendation shaping;
- reviewed `PlexClient` public surface: 36 exports;
- generated `app/app.js`: 899696 raw bytes / 177661 gzip bytes;
- startup assets: 129 / 130 local scripts and 2208766 / 2210000 aggregate JavaScript bytes; exact baseline count is not frozen.

Task 3 remains open for the remaining export-by-export review. No unreviewed export is considered dead merely
because it has no external feature consumer.

## Phase 4 final audit and closure

The post-pruning `PlexClient` export matrix contains 36 reviewed exports. Thirty-five have at least one production consumer outside `plex-client.js`; `loadRecommendedItems` is the sole intentional test-visible exception. It is retained because its direct tests exercise recommendation-cache/LRU behavior, concurrent callers, retries and stale-response races at the transport owner boundary. Creating another transport owner or weakening those tests through `loadHome()` would add indirection without removing production coupling.

The `ApplicationController` audit found no remaining zero-consumer callbacks or duplicate lifecycle wiring strong enough to remove. The explicit dependency maps remain intentional. The one ownership gap was settings backup: it previously received four raw `PlexClient` methods directly while every other Plex-facing feature used `PlexFeaturePorts`. `PlexFeaturePorts.settingsBackup()` now exposes exactly those four playlist persistence capabilities, and the composition root wires the settings backup store through that reviewed port. Two one-use aliases (`assSubtitleServerIdentity` and `mediaPreferenceIdentity`) were inlined because they added no policy or lifecycle semantics.

Final Phase 4 metrics versus baseline `540226fe`:

- `app/plex-client.js`: 1833 lines / 76466 bytes -> 1333 lines / 55552 bytes;
- `app/coordinator/application-controller.js`: 1769 lines / 100980 bytes -> 1765 lines / 101002 bytes;
- `app/coordinator/plex-feature-ports.js`: 75 lines / 2156 bytes -> 83 lines / 2407 bytes, reflecting the explicit settings-backup capability boundary;
- `app/plex-home-model.js`: dedicated 162-line / 6627-byte owner introduced for Home/recommendation shaping;
- reviewed `PlexClient` facade: 36 exports;
- generated `app/app.js`: 899927 raw / 177658 gzip bytes;
- startup JavaScript: 129 / 130 local scripts, 2208997 / 2210000 aggregate bytes.

Verification on the final code state: `npm run verify` PASS; `npm run test:memory` PASS with 0/200 weak payloads, 0/100 runtime payloads and +0.03 MiB net heap growth; `git diff --check` PASS; `git fsck --no-dangling` PASS.

The cleanup performance policy is no longer a frozen historical-byte target. Runtime size and startup fan-out remain measured guardrails and may be raised deliberately when a reviewed architecture/correctness benefit justifies the cost; arbitrary budget increases remain prohibited.

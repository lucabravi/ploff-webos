> **Archived historical record.** This document describes a completed or superseded implementation phase. Do not use it as the current behavior reference; see `docs/README.md`.

# Multi-server library tabs design

Status: approved design; implementation pending.

## Goal

Ploff must expose libraries from every Plex Media Server available to the active Plex account as ordinary navigation tabs without forcing the viewer to switch the application's primary server manually.

The first delivery keeps Home and the existing global surfaces anchored to the primary server. Multi-server Home aggregation is explicitly deferred to a later step.

## Validated Plex behavior

A local probe against a Plex account with shared servers established the behavior this design relies on:

- `https://plex.tv/api/v2/resources` and `https://clients.plex.tv/api/v2/resources` returned the same PMS inventory;
- shared PMS resources were returned with `owned=false` and a server-specific access token;
- one shared PMS was unreachable through its local/direct routes but was reachable through Plex Relay;
- the Relay route passed `/identity` with the expected machine identifier;
- `/library/sections`, a library browse request, Continue Watching, and `/media/providers` all returned successfully through that shared-server token and route.

Therefore shared libraries do not require a separate media API. They require account resource discovery, source-specific access/route resolution, and correct propagation of that server context through Library, Detail, and Player.

## Viewer experience

Given a primary server `PloffNAS` and a shared server `Marco`, navigation can look like:

```text
Home
Film
Serie TV
Anime
Film · Marco
Serie TV · Marco
Watchlist
Playlists
Search
Settings
```

Rules:

- `Home` is always present, always named Home, and is not configurable as a library tab.
- Libraries from the primary server use the Plex section title by default.
- Libraries from another server use `<section title> · <server name>` by default.
- A user-defined alias always wins over the generated title.
- Newly discovered libraries are visible by default unless an existing saved preference says they are hidden.
- Library tabs from owned secondary servers and shared servers use the same model. `owned=false` affects labeling/capabilities, not browsing eligibility.
- Existing Watchlist, Playlists, Search, and Settings entries remain outside library-tab ordering.

The existing navbar long-press reorder interaction remains available and writes to the same preference store as Settings.

### Compact navbar presentation

Navbar presentation is customizable without changing navigation semantics.

- `Settings` is always rendered as an icon-only gear button.
- `Search` is always rendered as an icon-only magnifying-glass button.
- `Home` remains semantically and textually Home and cannot be aliased or hidden.
- One global setting controls Home and every library as text-only, icon-only, or icon+text. Per-library presentation modes are deliberately not exposed because mixing them makes the TV navbar visually inconsistent.
- Library text is the library alias when one exists, otherwise the Plex section title. Every non-primary PMS adds ` · <server name>`; a shared-server alias replaces that server name.
- Each library can choose from the small built-in icon catalog `movie`, `tv`, `anime`, `documentary`, `kids`, `music`, `folder`, and `star`; Home uses `home`.
- Search and Settings icons are fixed and not part of library preferences.
- Icons are bundled Tabler outline SVG paths under the MIT license, with no runtime font or network dependency, and remain Chrome 53-safe.

The default preserves the existing text-only appearance. Newly discovered secondary sources are enabled automatically and use their generated `section · server` label.

## Settings experience

Settings contains a dedicated **Home & libraries** category immediately after Plex. The final UX keeps only three top-level entry points:

- **Navigation bar**: one global text/icon/icon+text choice for Home and libraries.
- **Libraries**: visibility, displayed library name and icon. Shared PMS headers can also edit the displayed server name. The primary PMS is not a focusable pseudo-action. The same surface ends with **Order libraries**, which opens the Left/Right ordering mode backed by the same store as navbar long-press.
- **Home**: the existing Home-row ordered-subset editor.

User-facing copy uses **Name** instead of the internal `alias` term; an empty custom value continues to fall back to the live Plex name.

`Home` is not shown as an editable library source and remains fixed, visible, named Home, and primary-server-only.

If a previously available library temporarily disappears, it is not rendered as a broken navbar tab. Its preference record is retained for up to 90 days so that alias, visibility, and order can be restored if the same `serverMachineIdentifier + sectionKey` reappears. The store is additionally capped at 128 source records and prunes the oldest unseen records first.

## Core data model

Introduce a stable `LibrarySource` record. It is metadata, not credentials:

```text
LibrarySource
  id                    stable composite identity
  serverMachineIdentifier
  serverName
  primary
  owned
  sectionKey
  sectionTitle
  sectionType           movie | show
```

The stable source identity is derived from:

```text
serverMachineIdentifier + sectionKey
```

A Plex `sectionKey` alone is not globally unique and must no longer be used as the identity of a library preference.

The navigation item for a library carries its `sourceId` in addition to the existing section key/type/title.

Media identity that can coexist across source boundaries must likewise include the server identity. Two PMS instances can both expose `ratingKey=123`; cross-feature or persisted state must not assume those are the same object.

## Primary server versus content source

The existing `ServerFeatureController.activeServer()` remains the **primary server**. It continues to own:

- Home;
- the Server setting and persisted selected server;
- activity polling;
- the default application config;
- Search in step 1;
- Playlists in step 1;
- Watchlist local resolution in step 1.

Opening `Film · Marco` must **not** call the existing user-facing `switchServer()` path. That path intentionally persists the selected server, resets content, returns to Home, and reloads the application.

Instead introduce a source-scoped content context resolved from a `LibrarySource`:

```text
ContentSourceContext
  sourceId
  serverMachineIdentifier
  owned
  apiBaseUrl
  token
```

Credentials and route URLs are resolved at runtime and never persisted in `LibrarySource` or library-tab preferences.

The source context belongs to the current Library -> Detail -> Player browsing chain. Leaving that chain for Home or another primary-server global surface does not change the configured primary server.

`ServerFeatureController` remains the owner of account tokens, server resources, connection verification, and failover primitives. It exposes a source-resolution operation that returns a `ContentSourceContext` for a requested `machineIdentifier`; Library code does not call `PlexAuth` directly. A new Library-owned source catalog combines those resolved server contexts with `/library/sections` results and tab preferences.

## Source discovery

Primary-server startup must remain fast and retain its current behavior.

After the primary Home is usable, an account-linked installation may refresh the Plex account resource inventory without blocking Home. For each account PMS other than the primary server:

1. keep/merge the resource by `machineIdentifier`;
2. resolve the active Plex profile's server-specific access token;
3. evaluate known local, direct-remote, and Relay routes;
4. verify `/identity` against the expected machine identifier before accepting a route;
5. load `/library/sections` through a verified route;
6. map supported `movie` and `show` sections to `LibrarySource` records;
7. reconcile the resulting inventory with saved tab preferences.

The catalog is not limited to `owned=false`; another owned PMS is also a valid secondary source.

Add a section-oriented PlexClient operation that returns supported Plex library sections without constructing global navigation entries. The existing primary `loadNavigation()` path may delegate to the same parser/model so section parsing has one source of truth. Secondary source discovery must not synthesize Home/Watchlist/Playlists/Search/Settings entries per server.

Remote discovery is opportunistic and bounded. An unreachable PMS must not block primary Home or other usable shared servers. If no route can be verified, that server contributes no newly discovered sections for that refresh. Last-known preferences may remain retained but no broken tab is inserted solely from an unverified remote source.

The observed Relay-only shared PMS is a required regression case: failure of local/direct candidates must not make the server unavailable when a Relay connection verifies successfully.

## Active Plex Home profile

Secondary access is profile-sensitive.

When the active Plex Home profile changes:

- invalidate source-specific access contexts;
- refresh or revalidate the account resource/library-source inventory for that profile;
- do not reuse a token resolved for another profile;
- keep stored tab preferences keyed only by stable server/section identity, never by token.

A profile that cannot access a previously visible source simply does not receive that tab during the current session.

## Request ownership

PlexClient already accepts an explicit config object for Library, Detail, and Player calls. Multi-server support should preserve that property rather than introducing a second Plex transport stack.

The browsing chain becomes source-aware:

```text
LibrarySource
    -> resolved ContentSourceContext
    -> Library requests
    -> selected item + source identity
    -> Detail requests using the same source context
    -> Player/queue using the same source context
```

The global primary `config` is not mutated merely because navigation focus enters a secondary-server library.

Detail must retain the source identity of its origin. Player must receive an immutable source context for the playback/queue session so a later navbar operation cannot redirect in-flight playback requests to another PMS.

A playback queue is single-source in step 1. Cross-server queues are out of scope.

## Navbar preview and navigation

Current navbar focus schedules a preview after a short delay. Rapid navigation must not cause repeated global server switches.

For a secondary library, preview/activation resolves the library source context and issues library requests with that explicit context. It does not persist a different primary server.

Source-resolution and library requests remain generation/cancellation guarded so moving away from a tab cannot commit stale results from a slower Relay PMS.

When a source becomes newly available during background discovery:

- merge it into available navigation without stealing focus;
- apply saved order/visibility/alias;
- append a never-seen enabled source after the existing library tabs and before fixed global navigation entries.

## Library-tab persistence

Replace the section-key-only ordering assumption of `ploff.libraryOrder.v1` with a dedicated bounded library-tab preference store, for example `ploff.libraryTabs.v1`.

The store contains only non-secret metadata/preferences such as:

```text
sourceId
serverMachineIdentifier
sectionKey
enabled
alias
displayMode
icon
order/ordering identity
lastSeenAt
```

It must never contain:

- Plex access tokens;
- Relay/direct/local URLs;
- account credentials.

The store is reconciled against live `LibrarySource` inventory. Unknown/missing sources are retained for at most 90 days and the complete store is capped at 128 source records. Pruning removes the oldest unseen records first and never removes a currently discovered source.

### Migration

Existing `ploff.libraryOrder.v1` values contain only section keys. On first reconciliation after upgrade, map those keys to sections on the current primary server and preserve their relative order. Newly discovered sources append after that migrated order.

Do not reinterpret an old section key as a secondary-server section merely because the numeric/string key happens to match.

The new store records that legacy migration has completed. After that point `ploff.libraryOrder.v1` is never read as runtime authority. It may be maintained only as a derived primary-server order projection for backwards backup compatibility during the v1 transition.

Navbar long-press and the Settings editor both write the new store; there must be one ordering source of truth.

### Settings backup

The current settings backup already preserves `libraryOrder`. Extend the existing v3 backup payload additively with an optional `libraryTabs` field; do not bump the marker/version solely for this backwards-compatible optional field. Continue exporting the legacy primary-only `libraryOrder` projection during the v1 transition so older clients can still restore the primary tab order.

When both fields exist, the new client treats `libraryTabs` as authoritative. An older backup restored into the new client follows the primary-server migration rule above. An older client ignores the unknown `libraryTabs` field but can still consume the existing settings and `libraryOrder` fields.

## Capability gating

Browsing and playback eligibility are independent from server ownership.

Management operations are not assumed to be available on a shared PMS. For secondary/shared content:

- normal browse/detail/playback operations remain available when the source is reachable;
- refresh-library / refresh-metadata controls are capability-gated;
- `owned=false` is a conservative default for `canManage=false` unless Plex explicitly reports a management capability for that provider.

A `403` from a management API must never invalidate normal browsing/playback access to the source.

## State isolation and rating-key collisions

Audit state that can outlive one request or surface for assumptions that `ratingKey` is globally unique.

At minimum, prevent cross-server collisions in:

- watched/progress reconciliation across Home/Library/Detail;
- library/detail caches;
- media preference keys where server identity is not already part of the key;
- queue item identity;
- navigation restoration records.

A watched change on `Marco/ratingKey=123` must never mark `PloffNAS/ratingKey=123` as watched.

Because Home remains primary-only in step 1, watched/progress updates originating from a secondary source must not reconcile into primary Home by bare rating key.

## Failure behavior

Expected behavior is local and source-specific:

- unreachable secondary server: show a normal source-unavailable message and keep Ploff on a usable surface;
- failed direct route with working Relay: use Relay after identity verification;
- source revoked by owner: remove its active tabs on inventory refresh while retaining bounded preferences;
- profile switch removes access: remove those tabs for the active profile;
- source disappears while Detail/Player is active: current request/playback handles the network failure normally; no automatic switch to a same-key item on another PMS;
- primary server failure remains governed by the existing primary failover behavior.

A failure on one secondary PMS must not reset Home or invalidate tabs from another server.

## Startup and performance

Multi-server discovery must not regress first-focusable Home startup.

Requirements:

- primary navigation/Home keep their current startup path;
- account-resource and secondary-section refresh starts only after primary UI readiness or another existing safe cloud-work point;
- remote PMS probes use bounded concurrency and existing timeout/cancellation principles;
- Relay-only servers may be slower without blocking local navigation;
- background discovery may update the navbar incrementally.

## Privacy and diagnostics

Library-source preferences are local metadata and may include user-chosen aliases/server labels, but no credentials or URLs.

Existing support-report allowlists must remain explicit. Do not automatically export source aliases, server names, machine identifiers, or section titles merely because they become persisted application state. Any future diagnostic addition must be separately privacy-reviewed and sanitized.

## Step 1 global-surface semantics

To keep the first delivery bounded and predictable:

- Home: primary server only;
- Search: primary server only;
- Playlists: primary server only;
- Watchlist: existing account behavior with primary-server local resolution;
- Library tabs: all reachable discovered PMS sources;
- Detail/Player opened from a library tab: same source as that tab.

This means selecting a secondary library never changes what Home means.

## Step 2: multi-server Home (deferred)

A later feature may aggregate Home rows across multiple servers, for example Continue Watching or Recently Added.

That step is intentionally excluded here because every Home card would need a stable server/source identity and merge semantics for ordering, deduplication, progress, errors, and navigation. Step 1 prepares for it by making source identity explicit through the Library -> Detail -> Player chain.

No Step 1 code should assume that `sourceId` is only useful to Library if that assumption would make Step 2 require another identity migration.

## Out of scope

Step 1 does not include:

- merged catalog rows containing media from several PMS instances;
- multi-server Home rows;
- cross-server Search;
- cross-server Playlists;
- cross-server playback queues;
- automatic media deduplication across servers;
- changing the primary server when a secondary library tab is opened;
- new Plex account requirements for local-only users.

Local-only Ploff installations continue to behave as they do today, with the new library-tab editor still usable for their primary libraries.

## Test strategy

Implementation must be test-first and cover the behavior at the smallest owning boundary.

### Pure/model tests

- stable `serverMachineIdentifier + sectionKey` source identity;
- identical section keys on two servers remain distinct;
- generated primary versus secondary titles;
- alias override/reset;
- enabled/disabled filtering;
- deterministic ordering;
- new sources default enabled;
- legacy `ploff.libraryOrder.v1` migration only onto the primary server;
- bounded missing-source retention/pruning.

### Account/server tests

- account resource parsing retains `owned=false`;
- owned and shared non-primary PMS resources are eligible sources;
- server-specific token resolution;
- local/direct failures followed by successful Relay identity verification;
- wrong `machineIdentifier` route rejection;
- one unreachable PMS does not block another reachable PMS;
- active-profile changes invalidate source access contexts.

### Navigation/Settings tests

- Home remains first and is not editable as a library tab;
- the **Home & libraries** category contains navigation appearance, library customization, library ordering, and Home-row ordering;
- primary and secondary tabs receive expected default labels;
- hidden sources disappear from navbar;
- library aliases, shared-server aliases, global display mode and order survive reload;
- Settings reorder and navbar long-press update the same store;
- background source insertion does not steal navigation focus.

### Library/Detail/Player tests

- secondary library calls use the secondary source config;
- primary global config and persisted primary server do not change;
- navigation preview cancellation cannot commit a stale secondary response;
- Detail inherits the source of the selected library item;
- playback, transcode, timeline, stream selection, subtitle and queue calls stay on that source;
- Back returns to the originating secondary tab;
- rating-key collisions across two PMS instances cannot cross-update watched/progress state;
- queues remain single-source.

### Backup/privacy tests

- new library-tab preferences round-trip through settings backup;
- v2/v3 backups with only legacy `libraryOrder` still import;
- no token/URL enters the library-tab store or exported diagnostics.

### Live acceptance

Use a real account with at least one shared PMS. The observed Relay-only scenario is mandatory:

1. primary Home remains usable before remote discovery finishes;
2. shared movie/show tabs appear automatically;
3. enter a shared tab whose direct routes fail but Relay succeeds;
4. browse, open Detail, start playback, seek, and return to the same tab;
5. switch repeatedly between primary and shared tabs;
6. rename/hide/reorder a shared tab, restart Ploff, and verify persistence;
7. verify Home remains the primary server's Home throughout;
8. make the shared PMS unavailable and confirm failure stays isolated to that source.

## Acceptance criteria

Step 1 is complete when:

- reachable libraries from account PMS resources appear as normal tabs without manual server switching;
- newly discovered libraries are enabled automatically;
- users can hide, alias, choose icons for, and reorder library tabs from Settings;
- navbar long-press and Settings use one ordering source of truth;
- Home remains fixed and primary-server-only;
- shared Relay-only libraries browse and play without changing the persisted primary server;
- source identity prevents same-`ratingKey` collisions across PMS instances;
- unreachable/revoked secondary servers fail independently;
- existing local-only behavior and startup readiness remain unchanged;
- full automated verification, memory checks, and physical-TV acceptance pass.

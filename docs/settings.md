# Settings architecture and maintenance

Ploff keeps persisted Settings definitions, Settings presentation, migration logic,
and runtime side effects deliberately separate. This prevents adding a UI row from
silently changing persisted data and prevents a storage refactor from coupling the TV
presentation to migration details.

## Sources of truth

- `app/settings-schema.js` is the authoritative registry for **persisted Settings
  fields**. It owns each stored key, default value, normalization kind, and bounded
  allowed values where applicable.
- `app/settings.js` owns the **versioned storage contract**, validation orchestration,
  Plex account seeding, and sequential migrations between persisted schema versions.
  It also retains explicit compatibility handling for historical shapes that cannot be
  represented as ordinary field metadata.
- `app/settings-catalog.js` is **presentation-only**. It describes Settings sections,
  labels, controls, and choice presentation. It is not a persistence schema and must
  not become one.
- `app/coordinator/settings-controller.js` owns Settings runtime side effects such as
  applying themes, accessibility state, language, and saved-settings operations.
- `app/settings-backup-format.js` is a separate saved-settings interchange contract.
  Its version does not track the local Settings storage version.

The browser dependency order is:

```text
theme-registry.js
  -> settings-schema.js
  -> settings.js
  -> settings-catalog.js
```

`npm run check:styles` and Settings integration tests guard the required order. The
`visualTheme` allowed values are derived from `ThemeRegistry.ids()`, so registering a
new theme does not require a Settings schema migration or a duplicated choice list.
ThemeRegistry also declares whether a theme exposes user accent-color customization.
The persisted `accentColor` value is retained globally, but the Settings catalog shows
that row only for themes that opt in (currently Simple/Classic and Immersive), immediately
below the visual-theme row. Themes with an owned palette hide the row without clearing
the saved accent, so switching back restores the previous choice.

## Adding a persisted setting

1. Add one definition to `app/settings-schema.js` with a stable key, default value,
   normalization kind, and allowed values if the setting is bounded.
2. Add or update focused assertions in `tests/test-settings-schema.js` and
   `tests/test-settings.js`.
3. If the new field can be safely absent from older records, keep the current storage
   schema version and let validation supply its default. If existing persisted data
   needs reinterpretation, bump `CURRENT_VERSION` in `app/settings.js` and add exactly
   one migration from the previous current version.
4. If the setting is visible, add its presentation to `app/settings-catalog.js` and
   add only the required runtime side effect to `settings-controller.js`.
   Assign the row to exactly one Settings category and extend the catalog coverage test.
5. Decide independently whether the field belongs in saved-settings transfer. Do not
   assume every local field should be exported merely because it is persisted.
6. Decide independently whether Diagnostics needs the value. Support reports accept
   only explicit allow-listed fields in `app/support-snapshot.js`.
7. Run the Settings tests, lifecycle tests, and full `npm run verify` gate.

Do not duplicate defaults or static domain choice arrays in `settings-catalog.js`, controllers,
or views. The catalog reads bounded choices from `SettingsSchema.allowed(key)` and owns only
presentation such as translated labels, swatches, percentages, and control layout. Runtime
controllers should pass dynamic context only when a choice truly depends on current runtime state.

## Legacy-TV presentation and performance preferences

Three persisted preferences provide explicit escape hatches for viewing distance and older TV hardware without changing navigation or media identity:

- `uiTextScale` is presented as **Interface text size** (`Dimensione testo interfaccia` in Italian) and offers `90%`, `100%`, `115%`, and `130%`. `100%` preserves the historical pixel-equivalent typography. The root `--ui-text-scale` sets the `rem` baseline, while card/poster geometry remains in fixed layout units; subtitle sizing remains independently controlled by `subtitleSize`, whose existing `75%`, `100%`, `125%`, and `150%` steps are extended with `175%` and `200%`.
- LAN/remote video quality and playback mode in Settings are explicitly labeled as **defaults**. The corresponding Player labels remain short because they are overrides for the current playback, not changes to those global defaults.
- `interfaceAnimations=false` is the existing reduced-motion preference. Nonessential transitions and animations collapse to effectively zero duration, while loading spinners remain active so asynchronous states stay visible.
- `artworkDataSaver=true` is presented as **Lightweight image loading** (`Caricamento immagini leggero` in Italian). It caps the visible and persisted poster/thumbnail quality at `80%` and backdrop quality at `70%`, while still allowing every lower quality step. Enabling it immediately lowers any higher saved value to those caps; disabling it re-exposes the full quality scales but does not restore a hidden previous value. Progressive loading also caps concurrent preview/full requests at `2`/`1`, but it no longer applies an extra hidden dimension multiplier: the two explicit quality settings remain the only source of requested image resolution.

`uiTextScale` and `artworkDataSaver` are included in device Settings backup alongside other TV presentation preferences. Older stored records remain valid because validation supplies their defaults when the keys are absent.

## Home and library navigation preferences

Dynamic library sources are persisted separately from the static Settings schema under
`ploff.libraryTabs.v1`. The store is keyed by the stable composite
`serverMachineIdentifier + sectionKey`, so equal Plex section keys on different PMS instances
never collide. It contains presentation metadata only: visibility, library alias, icon, order,
the single global Home/library navigation display mode, Home icon, and shared-server aliases.
Plex access tokens, server URLs, and resolved direct/Relay routes are never written to this store.

The **Home & libraries** Settings category is intentionally compact and exposes three entry points:

- **Navigation bar** selects one global `Text`, `Icons`, or `Icons + text` mode for Home and every library. Search and Settings remain icon-only.
- **Libraries** manages visibility, displayed library names and icons. Shared PMS headers can edit the displayed server name, while the primary PMS is not presented as a fake editable row. **Order libraries** lives at the bottom of this same surface and opens the existing Left/Right ordering mode; navbar long-press writes to the same source-aware order.
- **Home** opens the existing ordered-subset editor for Home rows.

The UI deliberately says **Name** rather than exposing the internal `alias` terminology. Empty custom names continue to mean “use the current Plex name”.

Newly discovered library sources are visible by default. Libraries from any non-primary PMS use
`<library> · <server>` labels by default, whether that secondary server is shared or also owned by
the account. Missing-source preferences are retained for up to 90 days (bounded to 128 source
records) so temporary server outages do not discard aliases, visibility or order. Home itself
remains fixed, named Home, and always visible in navigation; its content may include enabled
secondary PMS sources.

Two independent schema-backed settings control optional cross-server presentation:

- `aggregateLibraries=false` by default. **Merge matching library tabs** combines
  libraries with the same displayed name and Plex library type into one virtual tab.
- `aggregateHomeLibraries=false` by default. **Merge matching libraries on Home**
  combines matching library-specific Recently Added rows and simplifies Home badges
  for homonymous libraries by omitting the server suffix. Continue Watching and
  Recommended remain single cross-server rows whether this setting is on or off.

These settings do not enable multi-server discovery. Search and other source-aware
global flows may use enabled secondary PMS contexts regardless of whether the optional
merge presentation is enabled.

Each library may additionally store an optional `mergeGroup` (up to 80 characters)
in `ploff.libraryTabs.v1`. Matching groups and library types take precedence over
display names for navigation and Home aggregation. Missing/empty groups preserve
the existing name-based behavior. The sanitized library preference backup retains
this additive presentation field; it contains no route or credential data.

Saved-settings backup may carry the sanitized `libraryTabs` preference block and reloads it live
after restore; the legacy primary-only `ploff.libraryOrder.v1` projection is retained only for
backward compatibility.

## Home row visibility and order

`homeRows` is one ordered-subset preference rather than separate visibility switches and an
independent order list. Its current domain is `continue`, `recommended`, and `recent`; omitting
a value hides that Home-row group, while the remaining array order defines the group order.
Multiple Recently Added rows keep their Plex/library order inside the `recent` group. Unknown
future row kinds are left visible after the configured groups until they are deliberately added
to the Settings schema.

The setting is currently TV-global, is included in saved-settings backup, and does not require a
storage-version bump: older `ploff.settings.v3` records safely receive the schema default when the
field is absent. `showWatchlist` and `showPlaylists` remain separate because they control navigation
destinations, not Home rows. Likewise `upNextLayout` controls Player presentation and is unrelated
to Home-row visibility. If an optional Up Next Home row is added later, extend the `homeRows` domain
instead of adding another Home visibility boolean.

## Subtitle preference scopes

Subtitle settings edited from the main Settings screen are global defaults. Player subtitle presentation uses a sparse cascade with this precedence for values that are intentionally scoped:

`current media -> season -> global Settings`

The media and season layers may override subtitle selection intent, size, background, edge, and timing offset. Values equal to the parent layer are omitted rather than copied, so later global changes continue to flow through properties that were never intentionally customized. `subtitlePosition` remains global because it is not editable from the Player.

`subtitleRenderingSrt` and `subtitleRenderingAss` are different: **local renderer enablement is global-only**. Media/season records never persist `renderSrt` or `renderAss`; legacy scoped copies are ignored/normalized away. Advanced Subtitle Settings keeps the SRT/WebVTT and ASS/SSA renderer rows as convenient shortcuts to the same global Settings values. Turning either renderer on or off opens an explicit **Yes / No** confirmation explaining that the change applies globally. Confirmed global renderer changes take effect immediately and are not rolled back by subsequently cancelling the advanced-editor draft.

The Player and advanced-editor track selectors expose **Automatic** in addition to Off and concrete tracks. Automatic removes the current scope's explicit track intent and immediately resolves the inherited season/global choice. A season track preference stores a stable track signature rather than a Plex stream ID, because stream IDs can differ between episodes; each episode resolves the best matching available track from that signature.

Advanced Subtitle Settings uses **Apply** for the current media and **Apply to season** for the season layer. Style and offset changes follow the chosen scope, while subtitle selection is persisted only when the user actually changes the Track field in the editor. This prevents an automatic fallback track from becoming an accidental season preference. Explicitly choosing Automatic clears the scope's selection; choosing Off or a concrete track persists that explicit intent. Apply to season removes only media fields currently applicable to the selected renderer: disabled local-only values remain media exceptions instead of being erased by a server-owned session. Existing explicit overrides on other episodes remain untouched.

The single **Reset** action opens a choice dialog. Reset current media removes only the current media layer; Reset season removes only the season layer. Both actions are draft-only until Apply succeeds, so Cancel leaves persistent scoped preferences unchanged. Reset season never enumerates or deletes other episode overrides. Confirmed global renderer changes are intentionally outside that draft/Reset lifecycle. The editor status is informational and reports whether the scoped values come from global defaults, the season, the current media, or an unsaved draft.

The compact advanced editor uses a deterministic two-column remote-control layout implemented with legacy-safe flex wrapping. Directional keys move focus; they do not change Track, Size, Background, Edge, SRT, or ASS values. OK opens choices/toggles; renderer toggles use the global confirmation dialog. Offset and Timeline require OK to enter edit mode before Left/Right can modify them; OK or Back exits edit mode first.

The advanced editor accepts SRT/SubRip, WebVTT/VTT, and external or embedded ASS/SSA. Embedded ASS/SSA is exposed for playback timing and renderer-applicable controls only; Plex may supply a converted/lossy payload, so the editor does not claim to modify the original ASS document or its styles. Offset, loop and timeline are available for a supported selected track. Size is enabled only when the local renderer owns the pixels. Background and edge are enabled only for locally rendered SRT/WebVTT and remain disabled for ASS/SSA. Disabled rows remain visible, are skipped by D-pad focus, ignore OK/pointer input, and do not overwrite scoped values that may become applicable after a later renderer change. The Player summary shows a localized `SRT / WebVTT · LOCAL` or `ASS / SSA · LOCAL` badge only when runtime ownership is actually local; a global preference alone never causes the badge to appear.

## Normalization kinds

The registry contains declarative kinds for common stable behavior such as bounded
string/number enums, nearest numeric steps, booleans, language lists, ordered
priority lists, and ordered subsets whose omitted values are intentionally disabled. `app/settings.js`
interprets those kinds.

Historical semantics stay explicit. At the time of writing these include:

- legacy `videoQuality` feeding both LAN and remote quality;
- legacy `autoplayNext: false` becoming zero autoplay delay;
- legacy saved mode `sync` becoming per-device automatic save `on`.

Do not encode historical field names or migration policy into generic schema metadata
merely to reduce a few lines. Old-version meaning belongs in migration/compatibility
code where it is visible and testable.

## Storage schema changes

Current local storage is `ploff.settings.v3`. A schema bump is required only when
existing stored data must be transformed to retain its meaning. When bumping:

1. add the new storage key and current version;
2. keep every older key/migration step;
3. add a one-step `vN -> vN+1` migration;
4. add a representative fixture under `tests/fixtures/settings/`;
5. prove a skipped-release upgrade through `Settings.load()`;
6. prove cold startup sees migrated Settings before feature construction;
7. write only the newest validated record after migration.

Never reuse an old schema number for a changed shape and never guess how to interpret a
record from a newer schema than the running application.

## Development-time record contract

`PloffSettingsRecord` in `types/runtime-contracts.d.ts` describes the normalized
record, including its `version` metadata. Keep it aligned with the schema without
moving persistence defaults or allowed values into the declaration.
`tests/test-settings-type-contract.js` derives the exact key set and value categories
from `SettingsSchema.all()` and compiles real normalized values against the record.
It rejects missing, extra, optional, incorrectly typed, and `any` properties. The
compiler-backed check runs in the normal unit suite; it does not change storage or
require a schema migration when only a stale declaration is corrected.

## Review checklist

Before merging a Settings change, verify:

- one authoritative default exists in `settings-schema.js`;
- `Settings.defaults()` returns defensive copies for arrays;
- invalid persisted values normalize deterministically;
- old migration fixtures remain green;
- browser script order remains ThemeRegistry -> SettingsSchema -> Settings;
- UI catalog changes do not redefine persistence rules or duplicate schema-owned choice arrays;
- saved-settings and Diagnostics inclusion were considered separately;
- `npm run verify`, `npm run test:memory`, and `git diff --check` pass.

## Backup interaction lifecycle

The [September 6 boundary review](cleanup/2026-09-06-settings-backup-boundary-review.md)
retains interaction in SettingsController and persistence in PlexSettingsBackupStore.
First-run restore works while the Settings view is closed. User cancellation completes
once; destruction suppresses dialog continuations, late restore application, and late
backup-read effects. Already-started remote writes keep their existing completion or
rollback path but do not notify a destroyed consumer. This does not change backup
format versions, saved-device identity semantics, or compatibility import policy.

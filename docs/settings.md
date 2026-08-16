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
that row only for themes that opt in (currently Simple and Cinema), immediately
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

## Normalization kinds

The registry contains declarative kinds for common stable behavior such as bounded
string/number enums, nearest numeric steps, booleans, language lists, and ordered
priority lists. `app/settings.js` interprets those kinds.

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

# Changelog

All notable changes to Ploff are documented in this file.

## [1.0.4] - 2026-07-25

### Added

- Private, app-owned webOS DB8 storage for Plex account and Plex Home
  credentials, including automatic migration from legacy browser storage and a
  session-only fallback when private storage is unavailable.
- A privacy policy, in-app privacy information, and a complete local-data
  deletion action covering credentials, servers, preferences, subtitle
  offsets, navigation state, and the local client identifier.
- Network awareness backed by the official webOS API, with LAN, Internet, and
  local-only diagnostics, visible connection state, offline-safe local
  operation, and recovery when connectivity returns.
- A playback queue for playlists, series, seasons, collections, and mixed
  media playlists. The player exposes the queue without leaving playback and
  preserves Plex playlist ordering.
- A compact server-activity indicator in the navigation bar, including a
  Chrome 53-compatible animated state for legacy LG webOS TVs.
- Automatic playback-version ranking by resolution, HDR, estimated quality,
  and Direct Play compatibility, plus version affinity across adjacent
  episodes.
- Native TV locale detection for the initial onboarding language and
  background Plex discovery while the language is being selected.
- A TV-readable technical media-information dialog for the active file,
  available from media details and player settings without exposing full
  filesystem paths or raw Plex XML.
- LG Content Store preparation documents, static UX compliance checks,
  dependency auditing and update automation, plus a physical-TV release
  signoff gate.

### Changed

- Playback queues now continue through mixed item types in Plex's original
  order, while automatic version selection favors the best compatible source
  according to the user's preferences.
- Advanced subtitle controls use a compact, remote-friendly layout with modal
  selectors, live text-subtitle preview, delayed size application, loop-aware
  preview restarts, and clearer Apply and Cancel actions.
- Media detail pages use more consistent spacing, progressive artwork,
  non-flashing metadata transitions, readable summaries, and resilient
  backdrop loading.
- Library navigation, recommendation rows, recycled cards, empty states, and
  progressive images preserve focus and visual state more consistently.
- HDR priorities automatically adapt to detected TV capabilities and expose
  their availability in diagnostics and settings.
- Onboarding preserves discovery work across language navigation and avoids
  unnecessary repeated scans.
- Continuous integration now validates pull requests from Dependabot without
  granting elevated GitHub token permissions; release packaging uses refreshed
  pinned GitHub and Docker actions.

### Fixed

- Playlist queue navigation and the server-activity indicator retain their
  intended position and layout on legacy webOS, even when activity labels are
  visible or the navigation bar is crowded.
- Final playback progress is sent before leaving the player and protected from
  an immediately stale Plex response, so Resume uses the latest confirmed
  position after returning to media details.
- Direct Play, seek, chapter, buffering, and subtitle-preview recovery no
  longer leave stale loading indicators or mismatched presentation state in
  the covered regression cases.
- Interrupted progressive artwork requests can be retried instead of leaving a
  backdrop permanently unavailable.
- Offline state no longer disables reachable LAN Plex servers or triggers
  avoidable cloud requests.
- Setup no longer gets stuck after returning from language selection, and an
  unavailable network state is presented as informational rather than as a
  blocking failure.
- The media-information modules are imported through the browser namespace,
  preventing the packaged TV app from remaining indefinitely on its startup
  screen.

### Compatibility Notes

- Existing credentials are migrated on first launch. If private DB8 cannot be
  used, credentials remain available only for the current session and are not
  persisted in plaintext browser storage.
- Runtime compatibility remains Chrome 53 / legacy LG webOS; no framework or
  runtime dependency was added to the installed application.
- A public `v1.0.4` tag additionally requires the completed physical-TV
  regression signoff documented in `docs/testing.md`.

## [1.0.3] - 2026-07-22

### Added

- Reusable choice dialogs for media tracks, playback options, and application
  settings, with remote and LG Magic Remote pointer support.
- Full technical labels for audio and subtitle tracks, including Plex-provided
  names, codecs, channel layouts, and external-track information.
- Exact per-media track preferences so multiple tracks in the same language
  remain selectable and can be restored independently.
- A global preference for automatic selection of external or embedded
  subtitles, defaulting to external subtitles.
- A watched-state selector inside advanced library filters, synchronized with
  the quick All, Unwatched, and Watched controls.
- Optional classic T9 search input for numeric remotes, enabled by default for
  new installations.
- User diagnostics, improved setup status, and independently testable views for
  onboarding, server selection, settings, search, libraries, Watchlist,
  details, chapters, and player controls.
- ESLint, JavaScript type checking, generated-bundle validation, dependency
  auditing support, and a unified local/CI verification command.
- A local preview script and responsibility-based source fragments that build
  the Chrome 53-compatible TV bundle.
- A README screenshot gallery generated from the real interface with a fully
  fictional demo library and profile.

### Changed

- Interface-language choices now display every language using its native name.
- Accent-color selection keeps the inline palette and also provides a labeled
  modal with color swatches.
- Application settings use one catalog as the source for both lateral cycling
  and modal selection, preventing the two interaction modes from diverging.
- Automatic subtitles prefer the configured source type while preserving the
  user's language priority and forced-subtitle rules.
- Theme preview delay now defaults to 500 ms for new installations.
- Episode cards use one caption format across Home, libraries, search, and
  playlists.
- Movie, series, season, and episode labels use shared formatters, including
  localized singular and plural season counts.
- The coordinator is maintained as focused ES5 source fragments and generated
  into a single dependency-free runtime bundle for legacy webOS.
- CI and release verification now run linting, type checks, unit tests,
  compatibility checks, asset validation, and repository hygiene checks.

### Fixed

- Local Plex playlists are parsed and displayed consistently outside library
  navigation.
- Transient `waiting` and `stalled` events no longer leave a buffering spinner
  visible while playback is progressing normally.
- Expired or interrupted Plex sign-in attempts recover without leaving setup in
  a permanent loading state.
- Recycled library cards retain the correct identity, artwork, captions,
  progress, and focus while virtualized grids move.
- Stale asynchronous results are rejected across search, setup, libraries,
  Watchlist, diagnostics, and progressive image loading.
- Main settings, player settings, and detail selectors restore focus correctly
  after a choice dialog closes or is cancelled.
- Direct Play seeking follows the native browser `seekable` ranges instead of
  requiring data to be pre-buffered, while validating that webOS reached the
  requested position.
- Failed native seeks and decoder clock regressions rebuild once from the last
  confirmed absolute position, preventing first-frame/timeline mismatches,
  repeated corrective-seek loops, and permanent loading indicators.
- Direct Play recovery moves to an offset-capable Direct Stream before any
  transcoding fallback, preserving copied video and audio whenever possible.

### Compatibility Notes

- Existing global settings remain valid. New defaults apply only when a value
  has not previously been saved.
- Per-media language-only track overrides from development builds are replaced
  by exact track signatures; affected media fall back to automatic selection
  until a track is chosen again.
- Runtime compatibility remains Chrome 53 / legacy LG webOS with no framework
  or runtime dependency added to the installed application.

## [1.0.2] - 2026-07-21

### Added

- Complete Japanese and Korean interface localizations.

## [1.0.1] - 2026-07-21

### Added

- Expanded Home, library, search, detail, player, chapter, subtitle, onboarding,
  remote-control, and Plex server-management capabilities.

[1.0.4]: https://github.com/lucabravi/ploff-webos/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/lucabravi/ploff-webos/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/lucabravi/ploff-webos/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/lucabravi/ploff-webos/compare/v1.0.0...v1.0.1

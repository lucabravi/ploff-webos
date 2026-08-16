# Changelog

All notable changes to Ploff are documented in this file.

## [Unreleased]

## [1.0.6] - 2026-08-16

### Added

- An integrated Detail media-version browser: Version stays first and always opens
  technical file/video/audio/subtitle information, supports non-destructive preview
  across multiple files, and keeps explicit D-pad-reachable Cancel/Apply actions.
- Contextual Detail media options with confirmed whole-season watched/unwatched
  mutations, sequential best-effort updates, fresh season reload, partial-failure
  reporting, and metadata refresh.
- Three additional visual themes built as isolated Chrome 53/webOS designs:
  `premiere` (premium cinematic), `nova` (futuristic tech), and `atelier`
  (minimal luxury), each with theme-specific Home, browsing, Settings, Detail,
  Player, focus, and motion treatments.
- A unified local `release:package` command that rebuilds generated assets, runs the pre-release gate, packages and inspects the IPK, and writes SHA-256 checksums without mutating Git or version metadata.
- Versioned fixtures for local Settings, saved-settings backup payloads, and playback compatibility memory, including non-destructive recovery of legacy split v2 saved-settings playlists.
- Diagnostics support export now keeps the QR mail draft while also showing the same privacy-safe report text as a legacy-TV-friendly fallback.
- Contextual media actions opened by long-press OK or the Magic Remote center button, with dynamic watched/unwatched, clear-progress, play-from-beginning, and Continue Watching removal choices for movies and episodes.
- Detail media options now preserve whether a movie or episode was opened from
  Continue Watching, exposing the same removal action with Plex refresh, toast
  feedback, and immediate action cleanup after success.
- TV calibration controls with independent safe-area insets and a live edge/center preview.
- Subtitle appearance controls for background, vertical position, and text edge, with a live in-settings preview driven by the same presentation variables used by playback.
- Optional high-contrast and stronger-focus presentation modes for TV viewing.
- Independent poster/thumbnail and backdrop download-quality controls. Poster
  artwork uses 70%, 80%, 85%, 90%, and 100% steps with a 90% default; backdrops
  use 50%, 60%, 70%, 85%, and 100% with an 85% default. These settings change
  Plex request resolution without changing on-screen element geometry.
- Origin-aware paginated playback sequences for Series, Playlist, and Collection
  origins, with bounded metadata and artwork retention, duplicate-safe occurrence
  identity, a virtualized queue drawer, and confirmation before crossing missing
  season or episode ranges.
- A pre-release memory lifecycle gate that repeatedly creates and destroys caches,
  dialogs, queue state, cancellable Plex requests, timers, and progressive-image
  jobs while checking deterministic teardown, `WeakRef` collection, and heap
  stabilization.
- Local Plex discovery through the packaged Luna service, restoring multicast GDM
  discovery on webOS while preserving manual server entry.
- Lazy, non-blocking update checks after the first successful Home load, with a
  clickable application-version row, manual refresh, release status, and QR link.
- Privacy-safe support reports now include allow-listed Settings and adaptive-playback
  compatibility schema/context summaries without exposing Plex tokens, credentials, server URLs,
  or local addresses.
- Explicit visible Cancel, Close, or Back actions for persistent dialogs that
  previously depended only on the remote Back key.
- Library-origin badges on mixed Home rows, Search, Watchlist, and playlist content.
- Watched-state and live Play/Pause markers in the playback queue.
- An exhausted-queue countdown that returns to Home or leaves the final frame paused
  when cancelled.

### Changed

- Accent-color Settings now sit directly below the visual theme, show the selected
  color swatch in the main list, and are visible only for Simple and Cinema;
  Premiere, Nova, and Atelier keep their theme-owned palettes while preserving the
  saved global accent for later theme switches.
- Home hero copy now uses the available horizontal gutter width instead of narrow
  percentage/max-width caps, reducing unnecessary title truncation across the shipped
  theme layouts while preserving each theme's visual treatment.
- Repository documentation was consolidated around current references: completed implementation plans and intermediate benchmark logs were removed from the working tree, the roadmap now contains only open work, and README and contributor guidance now provide clearer architecture and installation onboarding.
- Settings UI choice rows now consume bounded domain values directly from `settings-schema.js`; the catalog owns labels and presentation only.
- Application composition regression coverage now freezes server-switch, account reset/disconnect, and shared playback-identity lifecycle boundaries.
- Persisted Settings definitions are centralized in `settings-schema.js`, while the existing
  Settings catalog remains presentation-only; defaults and bounded choices now have one
  persistence authority without changing existing migration semantics.
- Release metadata now fails verification when `package.json`, `package-lock.json`, and
  `webos-shell-app/appinfo.json` drift, and tagged releases reuse the same canonical checker.
- Settings categories and rows were reordered into a clearer TV-first hierarchy, with Accessibility immediately after Interface and background theme audio grouped under Audio & themes.
- Adaptive playback compatibility fingerprints now include video bit depth and the actually selected audio/subtitle technical characteristics; file-specific exceptions also distinguish exact selected stream IDs.
- Playback compatibility storage moved to schema v3 with bounded TV/runtime/application metadata, explicit observation/derived/user-override provenance, and migration from v2.
- Application settings storage moved to schema v3 with explicit sequential migration from v1/v2 persisted records, including legacy video-quality, autoplay, and removed sync semantics.
- Replaced the temporary suboptimal terminal-transcode workaround with a bounded
  Direct Stream lookback and a verified native seek on the same absolute Plex
  clock. Requests within the final five seconds now jump to the actual native
  end and pause there, while ordinary Direct Play and Direct Stream playback
  keep their selected delivery mode.
- Ordered application settings now render as accessible stepped bars with the
  active value shown beside the track; LAN and remote video quality increase
  from 4 Mbps through 12 Mbps to Original at the rightmost step.
- Related settings, selectors, dialogs, filters, setup surfaces, and Player panels
  share action surfaces, focus rings, panel tokens, disabled states, and consistent
  secondary-left / primary-right action ordering.
- Ordinary pointer clicks now synchronize focus and use the same semantic OK path as
  the physical remote; timeline coordinates, navbar long-press, and other truly
  pointer-specific interactions keep dedicated handling.
- Main navigation Back now rises one visible level at a time through content, filters,
  sub-navigation, the current navbar item, and finally Home.
- Playback queues open on the current item but allow navigation to earlier episodes or
  earlier playlist/collection occurrences.
- Player settings focus the first available action on open and temporarily hide active
  Skip prompts without discarding them.
- Runtime bundle guardrails are documented as adjustable engineering alarms rather
  than webOS platform limits.
- Player return restoration now reloads the authoritative Plex origin for Series,
  Playlist, and Collection detail views and restores the exact played occurrence.
- Playlist and Collection detail share one presentation contract, while long
  containers and episodic queues load only bounded pages or season segments.
- The generated ES5 coordinator bundle is deterministically token-minified and
  verified through normalized AST equivalence.
- Plex pagination, media-document parsing, track normalization, cancellable HTTP
  transport, media choices, technical labels, search normalization, and server
  identity matching now use focused shared domain modules instead of duplicated
  implementations.
- Player terminology was reviewed across all eight locales, and unused translation
  keys were removed while preserving key and placeholder parity.
- The full Library catalog now uses focus-only updates, frame-scheduled scrolling,
  incremental keyed row reconciliation, in-place page append, and tiered artwork
  promotion while retaining the existing three-row overscan.
- Card geometry, fixed artwork dimensions, mounted-node lookup, bounded card
  presentation, and Search measurements now reuse explicitly invalidated caches instead
  of recalculating static layout data during navigation and scrolling.

### Fixed

- Concurrent, stale, malformed, aborted, or terminal Plex pages can no longer
  expand a known queue boundary, leave phantom items, or poison a later retry.
- Rapid Player selections and superseded playback preparation now preserve the
  latest user choice and abort obsolete metadata, decision, and stream work.
- Library and Recently Added pagination preserve raw Plex offsets and merge groups
  correctly when one season spans page boundaries.
- Home, dialog, Player, Up Next, queue-gap, progressive-image, and XHR lifecycle
  paths release timers, callbacks, handlers, and retained target bindings during
  replacement or teardown.
- Rapid navbar movement can no longer leave the highlighted navigation item and
  visible page out of sync when focus enters the content.
- Pointer hover no longer rebuilds settings, setup, choice, language, server, resume,
  or Library-filter controls before their click completes.
- Watchlist, Library, recommendations, theme audio, credentials, server probes,
  metadata refresh, cloud Search ordering, update checks, and local-storage failure
  paths reject stale work and remain bounded or non-blocking across profile, server,
  network, and lifecycle changes.

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

- Repository documentation was consolidated around current references: completed implementation plans and intermediate benchmark logs were removed from the working tree, the roadmap now contains only open work, and README/agent/archive guidance now provide clearer architecture and installation onboarding.
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

- Repository documentation was consolidated around current references: completed implementation plans and intermediate benchmark logs were removed from the working tree, the roadmap now contains only open work, and README/agent/archive guidance now provide clearer architecture and installation onboarding.
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
[1.0.5]: https://github.com/lucabravi/ploff-webos/compare/v1.0.4...v1.0.5
[1.0.6]: https://github.com/lucabravi/ploff-webos/compare/v1.0.5...v1.0.6
[1.0.3]: https://github.com/lucabravi/ploff-webos/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/lucabravi/ploff-webos/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/lucabravi/ploff-webos/compare/v1.0.0...v1.0.1

[Unreleased]: https://github.com/lucabravi/ploff-webos/compare/v1.0.6...HEAD

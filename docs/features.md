# Features

Ploff is an offline-capable Plex client for legacy LG webOS TVs. This document
describes features that are available in the current application; it is not a
roadmap.

## Connection and profiles

- Local Plex Media Server discovery through the bundled webOS service.
- Manual server addresses and optional Plex account linking.
- Local-first connection selection, remote direct routes, and relay fallback.
- Plex Home profile selection, including protected-profile PIN entry.
- Safe offline behavior: local playback and browsing remain available without
  Plex cloud access when a reachable local server and profile are configured.
- Network state in Settings, diagnostics, and the server-activity indicator.

## Home and navigation

- Configurable navigation bar with library ordering and long-press reordering.
- Home rows for Continue Watching, Recommended, Recently Added, collections,
  and library-specific content when supplied by Plex. Mixed-origin rows, Search,
  Watchlist, and playlists identify the source library on each card.
- Per-library tabs for Continue Watching, Recently Added, Recommended,
  catalog, collections, and playlists where applicable.
- Virtualized catalog grids with watched-state filtering, title, rating, and
  year sorting, advanced filters, progressive artwork, and pointer/wheel
  support for Magic Remote devices.
- Local search with on-screen keyboard and optional T9 input; linked accounts
  may use Plex-enhanced results while retaining server-local filtering.
- Hierarchical Back navigation returns through visible filters, sub-navigation,
  the current navbar item, and Home one level at a time.

## Media detail

- Series seasons, episodes, specials, film details, watched state, Watchlist,
  metadata refresh, and full media technical information.
- Detail keeps Version above Audio and Subtitles. Left/Right still cycles physical
  versions quickly; OK always opens the integrated version/technical-information
  browser, including when Plex exposes only one file. The browser previews versions
  without changing the active override, keeps the File/Video and Audio/Subtitles
  technical columns, and requires explicit confirmation before applying a different
  version.
- Contextual media options keep metadata refresh off the primary action row and add
  confirmed whole-season watched/unwatched mutations for the currently selected
  season. Bulk mutations continue across individual failures, reload fresh season
  state, and report partial results.
- Audio and subtitle selection remains available through directional controls or a
  choice dialog.
- Persistent media preferences with language priorities and an internal versus
  external subtitle preference.
- Resume, play-from-start, and cancel choice whenever Plex reports progress.

## Playback

- Direct Play, Direct Stream, and transcode strategies with selectable
  quality and version priorities.
- Automatic playback can remember confirmed Direct Play/Direct Stream failures:
  persistent format rules avoid repeated incompatible attempts, while
  file-specific exceptions expire after 30 days. Forced Direct mode always
  tries the requested direct strategies and offers an in-player switch to
  Automatic after a confirmed terminal failure.
- Absolute-clock resume and seek behavior for remote arrows, timeline pointer
  input, chapters, media changes, and recovery after stream replacement.
- Progress reporting to Plex, periodic keepalive for transcoding, watched
  state updates, and playback queues for series, collections, and playlists.
- Player controls, chapter drawer, skip intro and credits markers, configurable
  Up Next layouts, next-item backdrop, and a Home target when the queue is exhausted.
- A bounded queue drawer with earlier/later navigation, watched-state markers, and
  a live Play/Pause marker for the active occurrence.
- Audio, subtitle, subtitle-size, and advanced text-subtitle offset controls.
- 4K/HDR capability-aware version choice and diagnostics when the TV exposes
  that information.

## Interface and accessibility

- English, Italian, Spanish, French, German, Brazilian Portuguese, Japanese, and Korean
  interface locales.
- TV-first focus treatment, remote Back/OK/Play/Pause handling, Magic Remote
  pointer support, and wheel navigation modes.
- Configurable accent color, card scale, artwork and backdrop download quality,
  interface animations, background theme delay, and other viewer preferences.
- Accessible stepped selectors, explicit dialog exit actions, and lazy update checks
  exposed through the application-version row in Settings.
- User diagnostics with network, server, device, and playback capability data,
  plus a local QR support report. The report prioritizes the most recent playback
  failure, or falls back to the last played media, including the application
  version, LAN/internet state, Direct Play/Direct Stream/transcoding mode,
  bounded JavaScript errors, and technical video, audio, subtitle, delivery, and
  recovery details without Plex credentials.

## Packaging and quality checks

- One checked-in ES5 application bundle for legacy webOS Chromium, generated
  deterministically from the ordered coordinator sources.
- Local preview, Docker-assisted installation, generic IPK packaging, and IPK
  inspection that rejects development files and credential-like content.
- Automated bundle, lint, type-check, unit, baseline, asset, LG UX, and
  dependency-audit checks.

## Outside the current product scope

Unless product direction changes, Ploff intentionally does not target:

- Live TV or DVR;
- music-library playback;
- photo libraries;
- Watch Together;
- casting to other devices;
- a permanent TV-hosted support service;
- silent or automatic installation/package management from inside the TV app.

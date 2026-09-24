# Features

Ploff is an offline-capable Plex client for legacy LG webOS TVs. This document
describes features that are available in the current application; it is not a
roadmap.

## Connection and profiles

- Local Plex Media Server discovery through the bundled webOS service.
- Manual server addresses and optional Plex account linking.
- Linked accounts discover reachable libraries from additional owned or shared Plex Media Servers without changing the primary server. Secondary sources use their own server-specific token and verified local/direct/Relay route.
- When a Plex server is selected, known local, direct, and Relay routes are verified in
  parallel while preferring the highest-quality reachable class: local, then direct,
  then Relay. Runtime failover remains bounded and source-aware.
- Plex Home profile selection, including protected-profile PIN entry.
- Safe offline behavior: local playback and browsing remain available without
  Plex cloud access when a reachable local server and profile are configured.
- Network state in Settings, diagnostics, and the server-activity indicator.

## Home and navigation

- Configurable navigation bar with one global text/icon/icon+text presentation for Home and libraries. Search and Settings remain compact icon-only actions.
- Secondary-server libraries appear as ordinary tabs after discovery. Primary libraries keep their section name; secondary libraries use `section · server` labels, with per-library visibility/alias/icon choices and aliases for shared server names. Library order can be edited from Settings or by the existing navbar long-press shortcut.
- Matching libraries from different Plex servers can optionally be shown as one
  virtual tab when their displayed name and Plex library type match. The merged tab
  retains the concrete source variants required by Detail and Player.
- Merged Library tabs show the first useful page as soon as a member server responds;
  slower servers enrich and re-sort the page as they arrive. Deduplication, source
  variants, pagination, and focus follow stable aggregate identity. Recommendation rows
  use the same progressive merge, while background tab prefetch retains only complete results.
- Profile changes refresh secondary access; revoked or inaccessible sources are removed from active navigation while bounded presentation preferences remain available if they return.
- Home renders the primary PMS first, then accepts progressive contributions from
  enabled secondary servers. Continue Watching and Recommended are merged across
  servers. Continue Watching and Recommended remain single cross-server rows in both
  modes. Matching libraries can optionally be merged in Home: their Recently Added
  rows combine and their Home source badges use the library name without the server
  suffix; with merging disabled, secondary badges stay `<library> · <server>`. Home-row
  groups can still be hidden and reordered. Search, Watchlist, and playlists keep their
  own source-aware presentation; collections remain available through their library surfaces.
- Home hero presentation is independent from remote focus. As soon as at least one Home media
  card exists, a valid card supplies title, summary, metadata, and backdrop even while the
  navbar has focus. Media focus updates that presentation; navbar focus preserves it. When a
  slow initial Home load first returns empty and media arrive later, the first card receives
  initial focus only if the user has not already interacted with Home.
- Per-library tabs for Continue Watching, Recently Added, Recommended,
  catalog, collections, and playlists where applicable. Recently Added keeps one or
  two adjacent TV episodes as spoiler-safe `Season / Episode` cards; a run of three
  or more adjacent additions from the same season is compacted to `N new episodes`
  without merging across intervening feed items.
- Virtualized catalog grids with watched-state filtering, title, rating, and
  year sorting, advanced filters, progressive artwork, and pointer/wheel
  support for Magic Remote devices.
- Search with on-screen keyboard and optional T9 input; linked accounts fan search
  out across enabled reachable PMS contexts and merge successful results while
  retaining source-aware identity and Plex-enhanced matching.
- Hierarchical Back navigation returns through visible filters, sub-navigation,
  the current navbar item, and Home one level at a time.

## Media detail

- Series seasons, episodes, specials, film details, watched state, Watchlist,
  metadata refresh, and full media technical information.
- Detail has a remote-first lower information pane reached directly with Down after
  the episode/playback rows and returned from with Up. Genres, directors, and cast
  reuse the title metadata already loaded by Plex; cast cards and artwork are only
  rendered after entering the pane. Trailers/extras are requested only on first
  entry, preserve Plex order, and never block focus while loading.
- Detail keeps Version above Audio and Subtitles. Left/Right still cycles physical
  versions quickly; OK always opens the integrated version/technical-information
  browser, including when Plex exposes only one file. For aggregated TV libraries,
  matching episode copies from other enabled PMSes are kept as source-owned versions,
  with external copies labelled by server alias/name. Season-level batch recovery can
  complete missing episode variants without issuing one metadata request per visible
  episode. The browser previews versions without changing the active override, keeps
  the File/Video and Audio/Subtitles technical columns, and requires explicit
  confirmation before applying a different version; switching an episode PMS copy
  preserves the current series/season Detail context.
- Contextual media actions distinguish unwatched, partially watched, and completed movies/episodes.
  A long-pressed unwatched card offers **Mark watched**; a partial card offers **Mark watched**,
  **Mark unwatched**, clear-progress, and play-from-beginning actions; a completed card offers
  **Mark unwatched**. Continue Watching removal remains available only when the card actually comes
  from that surface. On a partially watched Detail, the first entry in the `...` media-options menu is
  the watched action complementary to the primary Detail button: **Mark watched** when the primary button
  is **Mark unwatched**, or **Mark unwatched** when the primary button is **Mark watched**.
- Contextual Detail media options keep metadata refresh off the primary action row and add
  confirmed whole-season watched/unwatched mutations for the currently selected season.
  From the second episode onward they can also mark only the preceding episodes as watched:
  Ploff reloads the season first, resolves the selected episode by rating key, skips entries
  already watched, and never crosses into the selected/later episodes. Bulk mutations
  continue across individual failures, reload fresh season state, and report partial results.
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
  Up Next layouts, next-item backdrop, and a Home target when the queue is exhausted. When a standalone
  Skip Intro/Credits prompt is visible over hidden or compact timeline controls, remote OK activates the
  skip directly; full controls keep their normal focused-action priority. A consumed marker stays hidden
  through the skip seek and bounded decoder/keyframe rollback, and becomes eligible again only after the
  marker interval has been exited and entered again. Missing/failed
  Plex chapter thumbnails stay on a neutral theme-aware placeholder at 70% opacity instead of exposing a broken-image glyph.
- Episode preview cards expose duration in the lower-left corner as `MM:SS` / `H:MM:SS`, with `--:--`
  when Plex does not provide a positive duration; the existing watched marker remains in its established position.
- A bounded queue drawer with earlier/later navigation, watched-state markers, episode-duration badges, and
  a live Play/Pause marker for the active occurrence.
- Audio, subtitle, subtitle-size, and advanced subtitle controls. Subtitle size keeps the existing 75/100/125/150% steps and adds 175% and 200%; Settings, the Player selector, and the advanced editor share the same bounded size domain. Track selection, size, background, edge, and timing can use sparse current-media overrides inheriting from optional season defaults and global Settings. Local SRT/WebVTT and ASS/SSA renderer enablement is global-only: the advanced editor exposes convenient renderer rows, but changing either one requires an explicit global Yes/No confirmation and never creates a media/season override. Reset remains draft-only for scoped values until Apply.
- Optional local rendering for text-based SRT/WebVTT and ASS/SSA subtitles over Direct Play.
  SRT/WebVTT and external or embedded ASS/SSA may enter Advanced Subtitle Settings. Embedded ASS/SSA
  exposes playback timing and only the controls applicable to the current renderer owner; Plex's
  converted payload is not treated as an editable original ASS document. ASS appearance remains
  libass-owned, while local SRT/WebVTT retains size, background and edge controls.
  Season track preferences use stable track signatures rather than episode-specific Plex stream IDs,
  while Plex's normal subtitle path remains the default and image subtitles are not rendered locally.
  The compact two-column editor keeps D-pad navigation deterministic: Left/Right navigate unless
  Offset or Timeline has first entered edit mode with OK. The appearance editor also offers a
  stronger double-outline plus shadow edge. The compact Player summary displays a localized local-renderer
  badge using the same typography as the adjacent Audio/Subtitles summary rows, only when SRT/WebVTT or ASS/SSA runtime ownership is actually local; server/native rendering,
  Force Transcode, loading, and subtitles-off states do not advertise local rendering.
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

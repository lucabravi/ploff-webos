# Architecture

Ploff is a dependency-free webOS application built for the older Chrome
53 WebView. Runtime JavaScript uses ES5 syntax and communicates directly with
Plex Media Server over the local network.

## Components

- `app/` contains the TV interface, player, Plex API client, authentication,
  settings, server discovery, and remote-control navigation.
- `app/i18n.js` is the small locale registry; `app/locales/` contains one
  complete offline locale file per supported interface language.
- `webos-service/` provides UDP-based Plex GDM discovery because browser code
  cannot send multicast packets.
- `webos-shell-app/` contains the webOS manifest and application icons.
- `scripts/` packages and installs the application with the LG webOS CLI.
- `tests/` contains dependency-free Node.js and shell regression checks.

Small state modules keep behavior testable without a browser. Episode boundary
resolution, chapter focus, localized media labels, resume choice, subtitle cue
timing and offset persistence, and diagnostic redaction live outside `app.js`;
the application shell owns their Plex requests, native-player lifecycle, and
remote-control focus.

Every locale is loaded statically before settings and application code. The
files are small enough for this to remain inexpensive, while avoiding dynamic
loading and network dependencies on older webOS browsers. The registry uses
English only as a safe fallback for a key introduced by a future app version.

## Configuration

`app/config.js` contains neutral publishable defaults. Packaging explicitly
excludes local overrides, so distributable IPKs cannot contain a fixed server
or token. The application discovers Plex servers and stores its selected
server, viewing profile, and interface preferences in webOS local storage.
When GDM finds no server, the same setup surface can query the signed-in Plex
account for owned or shared servers. Candidate LAN, direct-remote, and Relay
connections are tried in that order; only a verified endpoint is cached.
GDM and unauthenticated `/identity` responses are discovery hints, not proof of
ownership. A discovered URL cannot merge into an account server merely by
claiming the same machine identifier. For signed-in profiles, usable routes
must come from Plex account resources and an unauthenticated identity response
must match the expected server before the route is selected.
The same ordered probing is used after a primary navigation request fails. A
successful failover promotes the endpoint in both server and active-profile
state, while an exhausted failover leaves the local UI and manual server editor
available.

Search first queries the active server's ranked `/hubs/search` endpoint and
filters out unrelated recommendations. When an account token is available, a
bounded Plex Discover search supplies alternate-language titles. Text matches
and the provider's first high-confidence alias are considered; each cloud GUID
must still resolve through `/library/all` on the active server before it can be
merged into the visible results. Cloud failure never replaces or blocks local
results.

## Playback

The native HTML5 player uses a bounded delivery ladder: compatible Direct Play,
Plex Direct Stream, requested transcoding, then a conservative 8 Mbps fallback.
Direct Play is enabled only for capabilities reported by webOS and is skipped
when the chosen tracks require Plex processing. Playback diagnostics show the
source version, device UHD/HDR support, and effective delivery mode. Progress
is reported back to Plex throughout playback. A discontinuity-resistant clock
freezes during buffering and stream replacement, while explicit seeks remain
free to move backward. The clock and seeking rules verified on the target TV are documented in
[`playback-invariants.md`](playback-invariants.md).

Advanced synchronization is limited to text subtitles that Plex can expose as
WebVTT. External offsets are persisted by Plex; embedded text offsets are
stored locally per server, media part, and stream. Image subtitles and ASS/SSA
remain available for ordinary playback but disable the advanced editor.

## Views And Layout

Home, search, Watchlist, libraries, collections, and playlists share the same
poster geometry and bounded progressive image loader. Low-resolution previews
preserve the rendered aspect ratio; final requests use the measured card size,
and recycled cards replace identity, captions, rating, progress, and artwork as
one update. The global poster-size setting changes layout measurements,
virtualization windows, and requested artwork resolution together. Chapter
thumbnails use the same loader, while backdrops remain capped at the 1920x1080
UI canvas. Loading, empty, and
recoverable error states share one remote-friendly surface; search keeps its
state inline so the keyboard remains usable while a query changes.

All cancellable Plex, account, Watchlist, and image requests suppress stale
callbacks after a view changes. Immediate browser failures are deferred through
the same asynchronous completion path, preventing request handles from racing
their owning view state.

## Compatibility

The project intentionally avoids frameworks, build-time transpilation, modern
JavaScript syntax, CSS Grid, and browser APIs unavailable in Chrome 53. Keep
new runtime code ES5-compatible and run the complete test suite before
packaging. The manual playback and navigation matrix is in
[`testing.md`](testing.md).

Lifecycle guidance for the view coordinator is documented in
[`maintenance.md`](maintenance.md).

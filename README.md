# Ploff for Plex

[![Tests](https://github.com/lucabravi/ploff-webos/actions/workflows/ci.yml/badge.svg)](https://github.com/lucabravi/ploff-webos/actions/workflows/ci.yml)

**An offline-capable Plex client for legacy LG webOS TVs.**

Ploff is a lightweight, dependency-free client for LG webOS TVs. It provides
a remote-first interface, native playback, local server
discovery, Plex Home profiles, and an offline-capable LAN mode while remaining
compatible with the Chrome 53 WebView.

> Ploff is an unofficial community project and is not affiliated with or
> endorsed by Plex, Inc.

## Features

- TV-focused Home, search, library, season, episode, and player views
- Directional remote, media-key, LG Magic Remote pointer, and wheel support
- Bounded Direct Play, Direct Stream, and transcoding fallback with diagnostics
- Multiple media versions plus quality, audio, and subtitle controls
- Advanced text-subtitle synchronization with a local five-second preview
- Playback progress, watched state, next-episode autoplay, and metadata refresh
- Plex chapter browsing with progressive thumbnails and absolute seeking
- Cross-season episode navigation, explicit resume/restart, and user diagnostics
- Libraries, collections, local playlists, Watchlist, filtering, and sorting
- Progressive posters, global card sizing, backdrops, and media themes
- Local GDM discovery, account-based remote server fallback, and Plex Home profiles
- Automatic LAN/direct/Relay failover with manual server editing from Settings
- Ranked local search with optional language-alias enrichment limited to media on the active server
- English, Italian, Spanish, French, German, and Brazilian Portuguese interface

## Requirements

- Plex Media Server reachable from the TV
- LG TV with Developer Mode enabled
- [LG webOS CLI](https://github.com/webos-tools/cli)
- Node.js for tests

Install the CLI and configure the TV once:

```sh
npm install -g @webos-tools/cli@3.2.5
ares-setup-device
```

## Build And Install

No Plex address or token is required at build time. The application discovers
servers on first launch and lets the user continue locally or link a Plex
account at `plex.tv/link`. If no LAN server is available, sign-in can list the
account's owned and shared servers and connect through a reachable remote or
Relay endpoint.

If the selected endpoint later becomes unavailable, Ploff probes the saved
routes for that same server and persists the first working LAN, direct, or Relay
connection. The server address can always be changed manually from Settings.
Search remains fully local when offline; signed-in users may receive additional
title aliases from Plex Discover, but a result is shown only after its GUID is
resolved successfully against the active Plex Media Server.

Build a generic package:

```sh
./scripts/package-tv-shell.sh
```

Or build, install, and launch it on a configured TV in one step:

```sh
./scripts/install-webos.sh my-tv
```

Replace `my-tv` with the device name configured in `ares-setup-device`. You can
also set `WEBOS_DEVICE=my-tv` instead of passing an argument.

Generated packages always use the neutral defaults in `shell/config.js` and
never embed a fixed Plex address or token. Servers can also be entered manually
during setup when multicast discovery is unavailable.

## Prebuilt Releases

Every tagged version publishes a generic ready-to-use IPK in
[GitHub Releases](https://github.com/lucabravi/ploff-webos/releases). Release
packages contain no Plex address or credentials and discover the server during
first-run setup.

Download the IPK and its `SHA256SUMS` file, verify it, then install it on a TV
with Developer Mode enabled:

```sh
shasum -a 256 --check SHA256SUMS # macOS
# sha256sum --check SHA256SUMS   # Linux
ares-install --device my-tv io.github.rhapsodos.ploff_<version>_all.ipk
ares-launch --device my-tv io.github.rhapsodos.ploff
```

Release maintainers create a version by updating `webos-shell-app/appinfo.json`
and pushing the matching tag, for example `v1.0.0`. The release workflow runs
the complete test suite before publishing the package.

`ares-package` records build timestamps, so independently rebuilt IPKs are not
expected to be byte-identical. Each published artifact is nevertheless built
with the pinned CLI version, inspected before upload, and accompanied by the
checksum of the exact release file.

## Security

Plex account tokens and cached Plex Home profiles are stored in the TV
application's local storage. They are not encrypted by Ploff. Generated IPK
files do not contain these values. Local HTTP connections remain supported for
older TVs, but an untrusted LAN could observe metadata and authenticated media
URLs. Prefer Plex HTTPS endpoints on shared networks and treat the TV and home
LAN as trusted devices.

See [SECURITY.md](SECURITY.md) for the threat model and private reporting
instructions.

## Local Preview

```sh
python3 -m http.server 8098 --directory shell
```

Open `http://127.0.0.1:8098/`. Browser preview cannot perform webOS multicast
discovery, but a server can be entered manually and is retained in local
storage.

## Tests

```sh
for test in tests/test-*.js; do node "$test"; done
sh tests/test-baseline.sh
```

The tests enforce Chrome 53 JavaScript and CSS compatibility, Plex API contracts,
navigation behavior, playback invariants, and publishable repository hygiene.

## Compatibility Notes

Codec support depends on the TV and Plex Media Server; unsupported media can be
transcoded by Plex. Applications installed through LG Developer Mode remain
subject to the Developer Mode session and package expiration rules. Linking a
Plex account requires internet initially, while previously cached profiles and
local playback remain available offline.

## Project Structure

See [docs/architecture.md](docs/architecture.md) for the runtime components and
[docs/playback-invariants.md](docs/playback-invariants.md) for TV-verified seek
and resume behavior. The release matrix is in [docs/testing.md](docs/testing.md),
and contribution requirements are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Released under the [MIT License](LICENSE).

Plex and Plex Media Server are trademarks of Plex, Inc. and are used under
license. Ploff is independently developed and is not endorsed by Plex, Inc.

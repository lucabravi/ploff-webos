<p align="center">
  <img src="webos-shell-app/logo.svg" width="130" height="130" alt="Ploff logo">
</p>

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

- TV-focused Home, search, libraries, collections, playlists, Watchlist, and player
- Directional remotes, media keys, LG Magic Remote pointer, and wheel support
- Direct Play, Direct Stream, transcoding fallback, and playback diagnostics
- Quality, version, audio, subtitle, synchronization, chapter, and resume controls
- Playback progress, watched state, next-episode autoplay, and metadata refresh
- Progressive artwork, adjustable card sizes, backdrops, and media themes
- Local discovery, Plex Home profiles, and automatic LAN/direct/Relay failover
- English, Italian, Spanish, French, German, and Brazilian Portuguese interface

## Requirements

- Plex Media Server reachable from the TV
- LG TV with [Developer Mode enabled](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app)
- Docker (recommended), or Node.js and the LG webOS CLI for manual installation

On the TV, open the Developer Mode app and enable both **Dev Mode Status** and
**Key Server** before installing Ploff.

## Install With Docker (Recommended)

This method requires only Docker on the computer. Node.js, the LG webOS CLI,
and the Ploff package are contained in the installer image.

1. Install and start Docker.
2. Install the LG Developer Mode app, sign in, and enable **Dev Mode Status**.
3. Enable **Key Server** and keep its screen open for the first installation.
4. Run:

```sh
docker run --rm -it \
  -v ploff-webos-data:/data \
  ghcr.io/lucabravi/ploff-webos-installer:latest
```

Enter the TV IP address and the six-character passphrase shown by the Developer
Mode app. The installer retrieves the TV key, builds and verifies the generic
IPK, installs Ploff, and launches it.

The `ploff-webos-data` volume retains only the webOS device configuration and
key. Use the same command for future updates; pairing is skipped while the key
remains valid. The installer verifies the stored key before every update. If
the Developer Mode session or key expires, renew it on the TV, enable Key
Server, and run the command again to pair automatically.

For automation, the prompts can be supplied through `PLOFF_TV_IP`,
`PLOFF_TV_PASSPHRASE`, and optionally `PLOFF_DEVICE`. Run the image with
`help`, `pair`, or `package` instead of the default `install` command to inspect
the available operations.

## Manual Installation

Install Node.js and the [LG webOS CLI](https://github.com/webos-tools/cli):

```sh
npm install -g @webos-tools/cli@3.2.5
ares-setup-device
ares-novacom --getkey --device my-tv
```

Keep Key Server enabled while running `ares-novacom`. When prompted, enter the
passphrase shown by the Developer Mode app.

Download the IPK and `SHA256SUMS` from
[GitHub Releases](https://github.com/lucabravi/ploff-webos/releases), verify the
download, then install and launch it:

```sh
shasum -a 256 --check SHA256SUMS # macOS
# sha256sum --check SHA256SUMS   # Linux
ares-install --device my-tv io.github.rhapsodos.ploff_<version>_all.ipk
ares-launch --device my-tv io.github.rhapsodos.ploff
```

Replace `my-tv` with the name configured in `ares-setup-device`.

## First Launch

No Plex address or token is embedded in Ploff. On first launch, the app finds
local servers and can work without a Plex account. Linking at `plex.tv/link`
adds Plex Home profiles, remote servers, Watchlist, remote/Relay failover, and
improved multilingual search through localized titles and aliases. Search
results are still limited to media available on the active server. Servers can
always be entered or changed manually in Settings.

Previously linked profiles and local playback remain available if Plex cloud
services are offline. Search also remains local; online title aliases are shown
only after matching media is confirmed on the active server.

## Build From Source

For development, install Node.js and the webOS CLI, then run:

```sh
./scripts/package-tv-shell.sh
./scripts/install-webos.sh my-tv
```

`install-webos.sh` builds, installs, and launches the app. Generated packages
always use neutral defaults and exclude `app/config.local.js`.

## Prebuilt Releases

Every tagged version publishes a generic IPK, checksum, and multi-architecture
Docker installer. Release packages contain no Plex address or credentials.

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
python3 -m http.server 8098 --directory app
```

Open `http://127.0.0.1:8098/`. Browser preview cannot perform webOS multicast
discovery, but a server can be entered manually and is retained in local
storage.

## Tests

Node.js is required only for development and tests, not when using the Docker
installer.

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

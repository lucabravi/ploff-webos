# Ploff Product Roadmap / TODO

This file contains only open software and product work. Delivered behavior belongs in
`CHANGELOG.md` and `docs/features.md`; implementation history lives in Git, operational Store
work lives in `docs/store-submission/`, and physical-TV validation lives in `docs/testing.md`.

Ploff should remain fast, remote-first, offline-capable, privacy-conscious, and compatible with
the Chrome 53 WebView on legacy LG webOS TVs.

## Update guidance

- [ ] Consider showing the exact Docker installer command in the update dialog.
- [ ] Add concise in-app Developer Mode renewal/key re-pairing guidance for failed update attempts
      without implying that Ploff can renew or install itself.

## Library and discovery

- [ ] Search and select additional subtitles.
- [ ] Add an optional Up Next Home row and integrate it into the existing Home-row visibility/order
      preference rather than adding a second visibility toggle.

## Subtitles

- [ ] Investigate local PGS/SUP subtitle rendering as a future feature (**feasibility not yet confirmed**).
      Before implementation, prove that Plex Media Server can expose the selected PGS payload to
      the client without forcing video burn-in, especially for PGS tracks embedded in MKV files;
      sidecar `.sup` files and embedded tracks must be tested separately. Verify the actual PMS
      endpoint/response bytes, planner/profile behavior when subtitles are rendered locally, and
      that disabling server-side subtitles still preserves Direct Play/Direct Stream semantics.
      If PMS can provide the raw PGS stream, evaluate `libpgs-js` (or an equivalent Canvas-based
      renderer) on the real Chrome 53/webOS target, including main-thread parsing constraints,
      seek/sync behavior, 1080p/4K bitmap density, long-playback memory use, teardown, and fallback
      to existing Plex burn-in when local PGS is unavailable or unsafe. Do not add this to the 1.0.8
      release candidate; treat it as exploratory work for a later release.

- [ ] Evaluate optional external ASS/SSA font resolution so local rendering can use fonts requested
      by ASS styles when those font files are actually available, while keeping `default.woff2` as
      the fallback. Preserve `ASS_FONTPROVIDER_NONE` unless physical-TV measurements justify
      otherwise, and benchmark cold-start latency, RAM/cache pressure, package/download cost, and
      legacy webOS reliability before enabling the feature.

## Preferences

- [ ] Decide which optional preferences should be scoped to an individual Plex Home profile rather
      than the TV.

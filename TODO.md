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

- [ ] Evaluate optional external ASS/SSA font resolution so local rendering can use fonts requested
      by ASS styles when those font files are actually available, while keeping `default.woff2` as
      the fallback. Preserve `ASS_FONTPROVIDER_NONE` unless physical-TV measurements justify
      otherwise, and benchmark cold-start latency, RAM/cache pressure, package/download cost, and
      legacy webOS reliability before enabling the feature.

## Preferences

- [ ] Decide which optional preferences should be scoped to an individual Plex Home profile rather
      than the TV.

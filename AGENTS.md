# Ploff repository instructions

Start with `README.md` for product/install context, then read `CONTRIBUTING.md` and
the current references in `docs/README.md` before broad changes. `TODO.md` contains
only open work. `CHATGPT-HANDOFF.md` is archive metadata, not a second source of
development rules. Older completed implementation plans live in Git history. The September 6
checkpoint/acceptance records remain linked until deferred-startup physical-LG
validation is complete; they do not replace these permanent rules.

## Working rules

- Continue on the currently checked-out Git branch. Do not create a branch, fork, or
  worktree unless the task explicitly requests one.
- Runtime code shipped under `app/` and `webos-service/` must remain dependency-free
  ES5 compatible with the Chrome 53 webOS WebView.
- Never edit generated `app/app.js`, `app/player.js`, or `app/styles.css` directly.
- After coordinator, Player-manifest source, or loader changes run `npm run build:app`; after style/theme changes run
  `npm run build:styles`.
- Before completing work run `npm run verify`, `npm run test:memory`, and
  `git diff --check`.
- `npm run verify` includes `check:maintainability`. Do not bypass the current
  `SubtitleRuntime`, `NativeVideoDriver`, `PlaybackReposition`, `PlaybackTimeline`, or
  `PlayerQueueController` ownership rules, or raise its input-hotspot budgets merely to make a
  regression pass; intentional boundary changes require focused tests and docs.
- Read `docs/playback-invariants.md` before changing PlaybackController seek, buffering,
  recovery, or subtitle-sync behavior. A safe reposition/restore must use the existing seek
  path; `PlaybackRecovery.rebuild()` retries the current delivery and must not be used as a generic seek.
  Only explicit, classified `PlaybackRecovery.fallback()` may advance a recovery plan.
  `PlaybackReposition` must remain independent from `PlaybackRecovery`, and lifecycle/transient
  playback state belongs to `PlaybackSession` rather than new facade booleans.
- Advanced Subtitle Settings may open for SRT/SubRip, WebVTT/VTT, and both external and embedded
  ASS/SSA tracks. Treat embedded ASS/SSA as a playback-settings source, not as an editable original
  subtitle document: Plex may expose only a converted/lossy payload. Capability-gate every row from
  the selected track and actual renderer ownership: timing remains available for supported tracks,
  size requires local pixel ownership, SRT background/edge require the local text renderer, and ASS
  background/edge remain disabled because libass/ASS styles own their appearance.

## Persistent application state

- Read `docs/settings.md` before changing persisted Settings. `app/settings-schema.js` is
  the authority for persisted keys/defaults/allowed values; `app/settings-catalog.js` is
  presentation-only. Do not duplicate persistence defaults in the UI catalog.
- Current local Settings storage is `ploff.settings.v3`. Keep schema upgrades explicit in
  `app/settings.js`; never silently reinterpret an older persisted shape.
- When the Settings schema changes, add a one-step migration, keep older migration steps
  intact, and add/update a real fixture under `tests/fixtures/settings/`. Preserve historical
  saved-settings and compatibility fixtures under their own fixture directories as well.
- Current adaptive playback compatibility storage is `ploff.playbackCompatibility.v3`.
  Preserve the distinction between observed file exceptions, derived format rules, and
  explicit user overrides. Metadata must remain bounded and privacy-safe.
- Read `docs/diagnostics.md` before changing exported diagnostics. Support reports use allowlists
  in `app/support-snapshot.js`; never pass credentials, Plex tokens, raw server URLs, local
  addresses, or arbitrary Settings records through Diagnostics. QR and visible text exports must
  reuse the same sanitized report instead of creating separate serializers.
- `npm run verify` already rejects stale generated `app/app.js`, `app/player.js`, and `app/styles.css`; do not
  weaken those freshness gates.
- Release versions must remain identical in `package.json`, the root package in
  `package-lock.json`, and `webos-shell-app/appinfo.json`. `npm run check:release-metadata`
  enforces this. `npm run release:package` is the local build/verify/package/checksum entry point;
  it must not create tags, commits, pushes, or implicit version bumps.

## Visual themes

Read `docs/themes.md` before editing theme behavior.

- Keep one shared DOM and one generated runtime stylesheet. Do not dynamically load
  a different CSS file per theme.
- Register themes only in `app/theme-registry.js`.
- The shipped registry currently contains `classic`, `immersive`, `premiere`, `nova`,
  and `atelier`; do not special-case any of those IDs in controllers.
- Put theme-specific CSS only in `app/styles/themes/<theme>.css` and scope every
  selector to the registered `body.visual-theme-*` class.
- Use semantic theme tokens only for genuinely shared visual roles. Keep intentional
  per-theme geometry and layout as scoped CSS in the owning theme file.
- Every registered theme must define the required tokens enforced by
  `scripts/check-theme-contracts.js`.
- Add the theme label to every locale and preserve locale key/placeholder parity.
- Theme CSS must remain Chrome 53-safe: prefer transforms, opacity, gradients, borders,
  box-shadow, and ordinary transitions/keyframes; do not depend on CSS Grid,
  `backdrop-filter`, container queries, or modern color functions.
- Theme lifecycle must remain correct at startup, live Settings changes, and saved-
  settings loading for both same-device recovery and another-device imports.

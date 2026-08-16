# Contributing

## Focus and accent color

Remote and pointer focus is always shown in neutral white. The user-selected accent color is reserved for active state, progress, selections, and primary actions. Keep these meanings separate when adding controls.

Ploff targets legacy LG webOS televisions and the Chrome 53 WebView. Runtime
code must remain dependency-free ES5: no classes, arrow functions, `let`,
`const`, async functions, modules, framework runtime, or required transpilation.

Canonical application code lives in complete ES5 UMD modules under
`app/coordinator/` plus focused support modules under `app/`. The legacy
`app/source/` directory must not be reintroduced. Do not edit generated
`app/app.js` directly. After changing a coordinator module, run
`npm run build:app`; `npm run verify` rejects a stale bundle and runs the
parser-backed `npm run check:es5` compatibility gate. Development scripts and
tests may use the repository's supported Node.js syntax; delivered files under
`app/` and `webos-service/` may not.


## Visual themes

Ploff uses a shared DOM and one generated stylesheet. Theme-specific CSS must live in
`app/styles/themes/`, must be scoped to its registered `body.visual-theme-*` class,
and may change layout as well as visual styling. Do not add dynamic theme stylesheet
loading and do not put a theme-specific exception in `app/styles/core.css`.

`app/theme-registry.js` is the single registry for theme IDs, body classes, locale
keys, and CSS source files. The current shipped IDs are `classic`, `immersive`,
`premiere`, `nova`, and `atelier`; controllers must never branch on those concrete
IDs. Shared visual roles use the required semantic theme
tokens; intentionally different geometry/layout remains as scoped selectors in the
owning theme file. See [`docs/themes.md`](docs/themes.md) before adding or modifying a
theme.

Never edit generated `app/styles.css` directly. Run `npm run build:styles` after
changing theme or core CSS. Theme CSS must also stay within the Chrome 53 target: avoid
CSS Grid, `backdrop-filter`, container queries, and modern color functions; prefer
legacy-safe transforms, opacity, gradients, borders, shadows, transitions, and keyframes.

## Persisted Settings

Read [`docs/settings.md`](docs/settings.md) before adding or changing a stored setting.
`app/settings-schema.js` owns persisted keys, defaults, normalization kinds, and bounded
allowed values. `app/settings-catalog.js` owns presentation only. If old stored data needs
reinterpretation, add a sequential migration in `app/settings.js` and keep all older
migration steps.

## Release versions

`package.json`, the root project version in `package-lock.json`, and
`webos-shell-app/appinfo.json` must use the same stable `x.y.z` version.
`npm run check:release-metadata` and `npm run verify` enforce this. `npm run release:package`
provides the local build/verify/package/checksum pipeline. Build scripts must not implicitly bump
versions, create commits, push, or create Git tags.

## Before A Pull Request

Run:

```sh
npm ci
npm run build:styles
npm run build:app
npm run verify
```

Add or update focused tests whenever behavior changes. Run
`npm run test:pre-release` before a release and after changing asynchronous
lifecycle, cancellation, or teardown behavior. Follow the manual TV matrix in
`docs/testing.md` for focus, Back, pointer, wheel, playback, or native media
changes. Keep commits narrowly scoped and explain user-visible behavior in the
pull request.

When adding a new persisted data category, extend the local-data deletion path and its
tests in the same change. Update `PRIVACY.md` and `SECURITY.md` whenever persisted or
exported data changes. Before publishing a tagged release, update `CHANGELOG.md`,
complete the matching `docs/release-signoff/v<version>.md`, and keep the physical-TV
matrix in `docs/testing.md` aligned with any user-visible behavior that changed.

Never commit Plex tokens, cookies, personal server addresses, private media
metadata, diagnostics, local configuration, generated IPKs, or `dist/` files.
Use reserved example domains and addresses in fixtures.

English is the source locale. Every locale must retain key and placeholder
parity, and Plex-provided media titles must never be translated by the client.

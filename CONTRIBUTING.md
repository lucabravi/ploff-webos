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

## Before A Pull Request

Run:

```sh
npm ci
npm run build:app
npm run verify
```

Add or update focused tests whenever behavior changes. Run
`npm run test:pre-release` before a release and after changing asynchronous
lifecycle, cancellation, or teardown behavior. Follow the manual TV matrix in
`docs/testing.md` for focus, Back, pointer, wheel, playback, or native media
changes. Keep commits narrowly scoped and explain user-visible behavior in the
pull request.

Never commit Plex tokens, cookies, personal server addresses, private media
metadata, diagnostics, local configuration, generated IPKs, or `dist/` files.
Use reserved example domains and addresses in fixtures.

English is the source locale. Every locale must retain key and placeholder
parity, and Plex-provided media titles must never be translated by the client.

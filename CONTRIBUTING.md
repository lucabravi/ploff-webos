# Contributing

## Focus and accent color

Remote and pointer focus is always shown in neutral white. The user-selected accent color is reserved for active state, progress, selections, and primary actions. Keep these meanings separate when adding controls.

Ploff targets legacy LG webOS televisions and the Chrome 53 WebView. Runtime
code must remain dependency-free ES5: no classes, arrow functions, `let`,
`const`, async functions, modules, framework runtime, or required transpilation.

The canonical application coordinator lives in the ordered fragments under
`app/source/`. Do not edit generated `app/app.js` directly. After changing a
fragment, run `npm run build:app`; `npm run verify` rejects a stale bundle.

## Before A Pull Request

Run:

```sh
npm ci
npm run build:app
npm run verify
```

Add or update focused tests whenever behavior changes. Follow the manual TV
matrix in `docs/testing.md` for focus, Back, pointer, wheel, playback, or native
media changes. Keep commits narrowly scoped and explain user-visible behavior
in the pull request.

Never commit Plex tokens, cookies, personal server addresses, private media
metadata, diagnostics, local configuration, generated IPKs, or `dist/` files.
Use reserved example domains and addresses in fixtures.

English is the source locale. Every locale must retain key and placeholder
parity, and Plex-provided media titles must never be translated by the client.

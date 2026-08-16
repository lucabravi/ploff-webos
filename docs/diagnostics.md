# Diagnostics and support reports

Ploff diagnostics are a local troubleshooting surface for legacy webOS TVs. The UI may show
runtime state, but anything that leaves the TV through the support-report flow must cross the
privacy boundary in `app/support-snapshot.js`.

## Ownership and data flow

```text
runtime state / playback / Settings / compatibility summary
  -> diagnostics controller
  -> support-snapshot.js allowlists and sanitizes
  -> report.body + report.serialized + report.mailto
  -> diagnostics-view.js
  -> QR email draft + visible text fallback
```

`app/support-snapshot.js` is the only export shaper. Do not build a second serializer in a view,
controller, or feature module. The visible fallback text must use the already-sanitized
`report.body` (or the already-sanitized serialized report as a last fallback), never raw runtime
objects.

## Privacy contract

Support reports may include bounded technical context that is useful to reproduce a problem:
application version, TV/runtime capabilities, network reachability class, selected playback
strategy, media codecs, safe Settings values, compatibility schema/count summaries, recent
bounded lifecycle events, and sanitized JavaScript errors.

They must never include Plex tokens, cookies, credentials, raw server URLs, local IP addresses,
full filesystem paths, complete persisted Settings objects, or arbitrary storage/error objects.
Any new exported field requires a focused test that proves the field is present and a nearby
secret-looking field is absent.

## Export UX

The Diagnostics export action creates one privacy-safe report and exposes it in two equivalent
forms:

- a QR code containing a local `mailto:` draft for scanning with a phone;
- the same human-readable sanitized `report.body` in the dialog as a text fallback.

Ploff does not upload the report. Do not add an automatic network upload, clipboard dependency,
or file-download dependency to this flow without a separate design review; those APIs are not
reliable enough across the supported legacy webOS range.

## Extending diagnostics

1. Identify the smallest technical field needed for troubleshooting.
2. Add it to the explicit safe projection in `app/support-snapshot.js` rather than spreading an
   input object.
3. Bound strings/counts and sanitize free-form text with the existing helpers.
4. Update the compact payload/body only if the field is useful in a support exchange.
5. Keep QR size budgets intact (`MAX_SERIALIZED` and `MAX_QR_INPUT`).
6. Add/update `tests/test-support-snapshot.js` with positive and negative privacy assertions.
7. If export UI changes, update `tests/test-diagnostics-view.js` and the HTML contract in
   `tests/test-tv-shell.js`.
8. Run `npm run verify` and `npm run test:memory`.

## Relevant tests

- `tests/test-support-snapshot.js` — allowlists, sanitization, QR budgets, compact report content.
- `tests/test-diagnostics-view.js` — diagnostics lifecycle, QR rendering, visible text fallback.
- `tests/test-diagnostics-controller.js` / `tests/test-diagnostics-feature-controller.js` — feature
  ownership and routing.
- `tests/test-tv-shell.js` — packaged modules and diagnostics DOM contract.

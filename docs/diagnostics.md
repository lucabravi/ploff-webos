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

## Buffering-clock evidence

Playback diagnostics expose a deliberately small clock record so a rare webOS decoder reset can
be distinguished from a subtitle-renderer problem. `PlaybackController.diagnostics()` records:

- current `offsetBase`;
- raw native `video.currentTime`;
- the separately derived `offsetBase + video.currentTime` value;
- the public/native/offset checkpoint captured when `waiting`/`stalled` began or a
  low-readyState `timeupdate` defensively inferred the same buffering incident;
- final or in-progress recovery acceptance, short reason, initial rejection reason, delta,
  target, and candidate;
- cumulative bounded clock-repair count.

The completed recovery retains its originating buffering checkpoint until another incident or
playback reset, so a support report captured after playback resumes still explains what happened.
Reasons are fixed short values such as `accepted`, `transient-recovered`, `forward-jump`,
`backward-jump`, `native-domain-flip`, `offset-changed`, `invalid-sample`, `explicit-seek`,
`ended`, and `native-error`.

`DiagnosticsFeatureController` forwards only those explicit fields and `support-snapshot.js`
projects them again into the safe `playback.clock` object and compact QR payload. Do not export the
video source URL, Plex token, subtitle content, arbitrary error objects, or a raw playback/session
object alongside this clock record.


## Manual unbounded Web Inspector capture

Rare playback/decoder failures may need more history than the bounded support report can retain. Ploff
therefore exposes `PloffDebugCapture` specifically for an attached Web Inspector / Codex debugging
session.

This collector is **opt-in and inactive by default**. A normal Ploff launch retains no continuous raw
ASS/playback trace. Starting a debug capture clears any previous session and then retains events without
a time or entry limit until it is explicitly stopped or the WebView is destroyed. Because this is
intentionally unbounded, use it only while a debugger is attached and do not leave it running for an
unattended viewing session.

The collector is shipped as `app/debug-capture.js` but is deliberately excluded from the normal
startup bundle. Load it from the Web Inspector only when needed; the playback controller discovers a
late-loaded collector dynamically:

```js
var s = document.createElement('script')
s.src = 'debug-capture.js?v=dev'
s.onload = function () { PloffDebugCapture.start() }
document.head.appendChild(s)
```

After `onload`, `PloffDebugCapture.status()` must report `active: true` and `unbounded: true`. When the visible failure occurs, add a marker
without reloading or leaving the Player:

```js
PloffDebugCapture.mark('desync-visible')
```

Then export the complete session:

```js
PloffDebugCapture.export()
```

For a text payload that Codex can save from DevTools, evaluate:

```js
JSON.stringify(PloffDebugCapture.export())
```

After the payload has been saved, stop collection:

```js
PloffDebugCapture.stop()
```

The capture combines privacy-filtered events from two sources:

- Player lifecycle: native `waiting`/`stalled`/`canplay`/`playing`/`seeking`/`seeked`/`timeupdate`,
  buffering checkpoints and resume assessments, indicator grace/watchdog callbacks, explicit seeks,
  rebuild/source preparation/application, source/buffer/recovery generations, `offsetBase`, raw native
  time, derived native absolute time, public/subtitle clock, decoder-settlement state and clock repairs;
- ASS renderer timing: controller/renderer/worker samples, prepared-frame lifecycle, playback epoch,
  render generation, validity windows, libass/render/transport/RAF timing and final presented media time.

The playback bridge rejects unknown payload fields; the ASS bridge retains its existing per-stage allowlist. The collector also rejects secret-bearing field names and does not retain source URLs, Plex tokens, arbitrary settings, subtitle text or raw runtime/session objects. This manual trace is separate from the normal
bounded support-report export and must never be auto-enabled by Settings, startup code or playback state.

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
- `tests/test-diagnostics-feature-controller.js` — explicit forwarding of the bounded playback-clock
  allowlist into the support-report boundary.
- `tests/test-diagnostics-view.js` — diagnostics lifecycle, QR rendering, visible text fallback.
- `tests/test-diagnostics-controller.js` / `tests/test-diagnostics-feature-controller.js` — feature
  ownership and routing.
- `tests/test-tv-shell.js` — packaged modules and diagnostics DOM contract.

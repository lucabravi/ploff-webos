# Browser regression harness

This harness is intentionally separate from the shipped webOS runtime. It uses
Playwright to run the local preview with a pinned Chrome 53 compatibility profile:

- the user agent identifies the page as a webOS/Chrome 53 device;
- WebAssembly, ResizeObserver, and OffscreenCanvas are disabled because they are
  not available in Chrome 53;
- APIs that Chrome 53 already supports, such as `fetch`, `Promise`, and
  `URLSearchParams`, are left available;
- the test context records console output, page errors, network chronology,
  failed requests, a runtime capability report, screenshots, video, and a
  Playwright trace on failure.

The bundled browser is current Chromium, not a real Chrome 53 binary. This makes
the harness useful for application logic, race conditions, request ordering, and
fallback branches, but it cannot reproduce every Blink/webOS rendering quirk.
Final validation of native webOS APIs and video playback still belongs on the
simulator or TV.

Commands:

```sh
npm run test:e2e
npm run test:e2e:debug
```

For interactive debugging, use the persistent Playwright session instead:

```sh
npm run playwright:session
```

The first run opens a clean profile. Log into Plex there once and close the
session with `Ctrl+C`; later runs reuse the same profile, including its
`localStorage` and cookies. The profile is stored in
`artifacts/playwright/persistent-profile/`, which is ignored by Git. Set
`PLOFF_E2E_PROFILE_DIR` to use another profile location, or
`PLOFF_E2E_HEADLESS=1` for a headless session.

`test:e2e` and `test:e2e:debug` intentionally keep isolated contexts and the
boot test seeds an offline session, so they must not be used to preserve a
manual Plex login.

Artifacts are written under `artifacts/playwright/` and are ignored by Git.
Set `PLOFF_E2E_STRICT_CHROME53=0` to keep modern capability APIs while retaining
the Chrome 53 user agent, set `PLOFF_E2E_BASE_URL` to test an already-running
preview server, or set `PLOFF_E2E_BROWSER_PATH` to try a locally available
Chromium executable. The last option is deliberately opt-in: Playwright warns
that arbitrary executables are not guaranteed to be compatible with its driver.

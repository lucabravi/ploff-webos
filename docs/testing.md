# Testing

Install the development-only verification tools, then run the complete local
CI workflow:

```sh
npm ci
npm run verify
```

This first rejects a stale generated `app/app.js`, parses every delivered
runtime JavaScript file and the generated bundle as ECMAScript 5, then runs
ESLint, JavaScript type-checking, unit tests, repository baseline checks, and
shell asset validation. Node.js is required only for development, tests, and
packaging; it is not required by the installed TV application.

CI and tagged releases also run `npm run check:deps`, which queries the npm
registry and fails on unaddressed high or critical dependency vulnerabilities.
It remains separate from `npm run verify` so the local verification suite can
run without network access.

After editing a coordinator module, regenerate the browser bundle:

```sh
npm run build:app
npm run verify
```


Every file under `app/coordinator/` must also parse independently:

```sh
for file in app/coordinator/*.js; do node --check "$file" || exit 1; done
```

The generated `app/app.js` is excluded from direct lint/type ownership checks;
its bytes are checked against the independently linted and type-checked module
sources before any tests run.



## Runtime compatibility gate

`npm run check:feature-contracts` parses each vertical feature return object,
compares it with `scripts/feature-contracts.json`, and rejects public methods that
have no production/lifecycle consumer or production calls outside the declared
contract.

`npm run check:performance` keeps the generated Chrome 53 runtime below the current adjustable
raw and gzip engineering guardrails. These values are regression alarms and may
be raised deliberately for measured product functionality; they are not webOS
platform limits. Bundle tests freeze deterministic ECMAScript 5 token
minification and require normalized Acorn AST equivalence with the assembled
source, so the TV artifact stays compact without degrading coordinator source
readability or mangling public names and properties. Input-routing tests separately enforce that Home
directions avoid full application-session snapshots and unrelated queue routing.

`npm run check:es5` parses every JavaScript file delivered under `app/` and
`webos-service/`, including generated `app/app.js`, with the ECMAScript 5 parser
mode. It also rejects `Promise`, which is syntactically valid ES5 but prohibited
by the Chrome 53 runtime contract. Tests, build scripts, and ESLint configuration
remain Node-only tooling and may use modern JavaScript.

The parser is a development-only dependency. It is not bundled into the TV
application and does not change the dependency-free runtime.

## Automated architecture and runtime checkpoint

The final composition-root checkpoint is accepted only when all of the following
remain true:

```sh
npm run check:app-bundle
npm run check:coordinator
npm run check:architecture
npm run check:feature-contracts
npm run check:es5
npm run lint
npm run test:unit
npm run test:baseline
npm run check:assets
npm run check:lg-ux
git diff --check
```

`npm run check:architecture` uses an ECMAScript 5 AST, not regular-expression
guesses, for static invariants: native `video.src`/`video.currentTime` ownership,
forbidden private-controller construction in the root, direct root Plex transport,
root-owned feature timers, feature DOM mutations, private-state aliases, snapshot
mutation, and legacy source/adapters. It also reports composition-root line count,
lines over 200 characters, and maximum line length as readability information only.
`tests/test-coordinator-architecture.js` proves each rule with failing fixtures.

`tests/test-coordinator-ownership.js` retains narrow structural checks whose meaning
is inherently source-level, such as UMD isolation, named vertical ownership, and
bundle coverage. `tests/test-controller-contracts.js` freezes the
`PlaybackController` public API.

Behavioral claims are executable instead of inferred from source text.
`tests/test-application-composition.js` instantiates the real composition root with
fake feature owners and verifies construction order, exact reverse teardown, cleanup
after constructor/startup failures, event-binding ownership, cross-feature return
paths, active-view network recovery, and suppression of late startup callbacks.
Controller and feature suites verify timer/request teardown and stale-callback
suppression. `tests/test-plex-client-page-parsing.js` freezes raw-offset pagination across catalog,
Recently Added, Playlist, and Collection pages. `tests/test-plex-client-media-parsing.js` and
`tests/test-plex-client-media-document-runtime.js` prove that playback and media detail share
one ordered Media/Part/Stream traversal, while `tests/test-track-normalization.js` freezes the
common playback-facing track record.

`tests/test-plex-http.js` freezes success, status, network, timeout, deferred synchronous failure,
and abort semantics across Plex transports. `tests/test-media-choice-model.js` freezes the
track/version values consumed by Detail and Player, and `tests/test-search-text.js` freezes the
normalization shared by local and cloud search. `tests/test-media-info.js` verifies that technical
track labels use the same localized presentation formatter as the selection surfaces.

Queue suites additionally cover malformed and oversized Plex pages,
synchronous transport exceptions, monotonic terminal discovery, exact duplicate
occurrence restoration, and invalidation of an adjacent result when playback moves
to another episode inside the same series generation. See
  the architecture and maintenance references for the ownership rationale.

Install the lockfile-pinned development dependencies before running the pipeline.
If installation or an individual gate cannot run in a particular environment, record
that limitation in the verification log and execute only explicitly named fallback
checks. Never infer that an unexecuted command passed.

A clean ZIP check must also verify its SHA-256 checksum, `unzip -t`, exact HEAD,
clean working tree, `git fsck --no-dangling`, current bundle, and absence of
`node_modules/`, `dist/`, `build/`, worktree metadata, IPK, logs, caches, and
temporary files.

## Library catalog performance

Catalog performance is measured by the deterministic benchmark:

```bash
npm run benchmark:library-catalog
```

The default run uses 5,000 synthetic items and repeated focus, same-window scroll,
one-row scroll, and page-append scenarios. Operation counts are the primary signal;
Node timings are secondary and must be compared only with runs using the same workload
and environment.

The release suite also contains a deterministic 10,000-item catalog stress test that
proves DOM retention and artwork work remain bounded without reducing the configured
three-row overscan.

## Pre-release memory lifecycle gate

Run the explicit garbage-collection stress gate before freezing a release candidate
or after changing teardown, timers, requests, caches, dialogs, queue providers, or
progressive artwork:

```sh
npm run test:memory
```

The command requires Node.js with `--expose-gc` and is intentionally separate from
`npm run verify`. It repeatedly constructs, exercises, and destroys bounded queue
caches, shared dialogs, gap state, cancellable Plex requests, and progressive image
jobs. The gate combines:

- deterministic teardown checks for cache records, callbacks, handlers, XHR aborts,
  artwork jobs, image handlers, and preload ownership;
- `WeakRef` checks proving destroyed lifecycle payloads are collectable;
- repeated heap samples after forced collections;
- net-growth and linear-slope limits that reject a heap that does not settle onto
  a plateau.

The default run uses 400 lifecycle cycles per sample and six measured samples. A
complete local pre-release pass is available as:

```sh
npm run test:pre-release
```

For leak diagnosis, produce comparable V8 snapshots without adding them to the
repository:

```sh
npm run test:memory:snapshot
```

Snapshots are written under the operating-system temporary directory by default.
Set `PLOFF_MEMORY_SNAPSHOT_DIR` to choose another destination. The stress size and
limits can be overridden through `PLOFF_MEMORY_CYCLES`, `PLOFF_MEMORY_SAMPLES`,
`PLOFF_MEMORY_MAX_GROWTH_BYTES`, `PLOFF_MEMORY_MAX_SLOPE_BYTES`, and
`PLOFF_MEMORY_MAX_RETAINED` when investigating a regression.

This gate covers JavaScript ownership and collection under V8. It does not prove the
absence of leaks in the webOS Chromium DOM, native `HTMLVideoElement`, decoder,
texture/image cache, XHR implementation, or Luna services. Long-running playback and
navigation still require a physical TV or Beanviser.

## Clean-Room Release Check

Use a temporary clone or exported source tree with no previous `dist/`, local
configuration, browser storage, or webOS application data:

1. Clone the release commit into a new directory and confirm `git status` is
   clean and `app/config.local.js` is absent.
2. Install exactly `@webos-tools/cli@3.2.5` and run
   `./scripts/package-tv-shell.sh`.
3. Run `./scripts/inspect-ipk.sh`; verify the reported application version and
   webOS CLI version in the packaged `build-manifest.txt`.
4. Install the IPK on a TV after removing the previous Ploff application. The
   first screen must be onboarding, with no preselected personal server.
5. Verify GDM discovery, then reset application data and verify manual local
   address entry.
6. Complete offline setup and play from a trusted unauthenticated LAN server.
7. Reset again, link at `plex.tv/link`, select a Plex Home profile, and verify a
   LAN or account-provided remote/Relay server.
8. Restart the TV and confirm the selected server and profile are restored.
9. Temporarily remove internet while leaving the LAN server available; cached
   profiles and local playback must continue to work.
10. Temporarily stop or isolate the server; the UI must remain usable and offer
    retry/manual server selection without disclosing an authenticated URL.

Steps 1-3 are reproducible locally and in CI. Steps 4-10 require a physical TV,
a test Plex account/server, and deliberate network changes; never perform them
against another user's server or media state.

Before a release, verify these cases on a target webOS TV:

1. Complete startup and onboarding through discovery and manual setup; select a
   server and profile, confirm the loading cue remains visible while refreshing,
   unchanged profiles do not flash, and the selected server/profile survives restart.
2. Exercise Home focus restoration, navbar navigation and long-press/reorder, Search
   T9, every library tab, Watchlist, collections, and playlists. A completed item that
   leaves Continue Watching must not focus a duplicate in another row.
3. Verify library sorting, watched filters, virtualized/recycled cards, empty-state
   focus, and the disabled non-hoverable Collections tab when no collection exists.
   Playlist detail must show title, content counts, and watched/remaining duration.
4. Open movie, show, season, and episode Detail from Home, Search, Library, Watchlist,
   and playlist origins. Verify theme-audio continuity, watched/Watchlist mutations,
   media information, and Back restoration from Player settings without stale content.
5. Test Direct Play, Direct Stream, Auto fallback, Direct only, and Force transcode
   with 1080p SDR and supported 4K HDR10 material. Confirm diagnostics and bounded
   recovery match the effective delivery mode.
6. Test Resume, Play from beginning, Cancel, forward/backward seek, seek before the
   current transcode offset, repeated seek, rebuild, and recovery without losing the
   absolute playback position.
7. Change audio, subtitles, and media version. Exercise advanced SRT/WebVTT and
   embedded-text synchronization, size, loop, Apply, and Cancel while playing and
   paused; unsupported image/ASS-style advanced editing must remain clearly disabled.
8. Exercise playlist and episodic queues. The drawer must render content, identify the
   playing item, keep the focused item no lower than the penultimate visible position
   except for the final queue item, and retain visible focus while moving both ways.
   Test a playlist with thousands of items and repeated media occurrences; DOM and
   artwork must remain bounded and scrolling must not hitch when reversing direction.
   While one Previous or Next resolution is pending, repeat the same command and verify
   that it neither replaces the owning request nor queues playback for later.
   Repeat the bounded-window check with a synthetic series of at least 1,000
   episodes and verify that only intersecting season segments load, with metadata
   peak counts never exceeding five pages or 200 records.
9. Exercise both Up Next layouts: correct next-media artwork, smooth countdown,
   dismissal, cancellation of pending resolution and visible countdown after seeking
   away from the end, re-arming on a later native end, autoplay, and return to the
   current media. Verify skip prompts do not steal timeline focus while a direction is
   held and do not propagate unwanted navigation after receiving focus.
10. Exercise Chapters, progressive thumbnail upgrades, Previous/Next across regular
    seasons, playlist advance, Back, and Stop. Verify that a queue opened from Specials
    remains Specials-only and that a regular queue never enters Specials. For missing
    season or episode numbers, confirm that playback remains active while the shared
    confirmation dialog presents the next playable media; test both cancel and proceed.
    Closing playback must restore the exact
    Home, Search, Library, Watchlist, Detail, playlist, or Player-settings origin and
    focus the queue occurrence that was actually playing.
11. Exercise Magic Remote hover, click, wheel, timeline seek, queue selection, and
    long-press. A long-press must not produce a synthetic follow-up click.
12. Disconnect and reconnect LAN/internet while Home, Search, Library, Detail, Setup,
    Diagnostics, and playback are active. The active view must recover, cached local
    profiles/playback must remain usable where supported, and settings must not reset.
13. Open User diagnostics and verify current/last playback, local server identity,
    capabilities, strategy, buffered ranges, errors, and polling teardown. No Plex
    token, authenticated URL, or complete machine identifier may appear.
14. Test poster sizes at 70%, 100%, and 130%; artwork quality at 70%, 90%,
    and 100%; backdrop quality at 50%, 85%, and 100%; overscan; requested artwork
    resolution; every supported interface language; player accessibility labels; empty/error states; and focus
    visibility with both remote and pointer input.

The `1920x1080` manifest resolution is the application UI canvas. On UHD TVs,
webOS can still decode a 3840x2160 video surface; actual Direct Play and HDR
support depends on the model and source codecs.


## Physical-TV regression checkpoints

Automated extraction checks do not replace TV behavior. After the Player feature
checkpoint, verify Direct Play, Direct Stream, transcoding, resume, forward and
backward seek, seek before the current offset, rebuild/recovery, audio,
subtitles, version changes, subtitle synchronization, chapters, skip prompts,
Previous/Next, playlist queues, queue drawer focus, both Up Next layouts,
Back/Stop, and Magic Remote timeline input. Verify that closing playback restores
the correct Home, Library, Detail, or playlist origin and current queue item.

Repeat startup/onboarding, profile
selection, Home focus restoration, navbar long-press, Search T9, Library,
Watchlist, Detail, Settings, Diagnostics, network recovery, and the complete
Player matrix. Record physical results separately; local tests must not mark
these checkpoints complete.

For every problem found during a physical-TV run, record the exact reproduction path,
expected behavior, observed behavior, playback mode, and any visible log or
diagnostic evidence before changing code.

## Physical-TV Release Signoff

Official tagged releases require a completed, git-tracked signoff matching the
application version. Copy `docs/release-signoff/TEMPLATE.md` to
`docs/release-signoff/v<major>.<minor>.<patch>.md`, complete its metadata, and
check every item only after running the physical-TV matrix above.

The release workflow validates the signoff before packaging or publishing any
artifact. `Matrix SHA-256` is the digest of the normalized numbered matrix in this
file, not a free-form value. `tests/test-release-signoff.js` keeps both the template
digest and item count synchronized. Any change to matrix numbering or wording
invalidates older signoffs even when the number of checks is unchanged. Update the
template digest and repeat the complete physical test; never retrofit a new digest into
an older PASS. The existing `v1.0.4` signoff predates this expanded matrix and is not a
signoff for the current checkpoint.

Local builds, Docker installations, and downstream forks remain unblocked by this
official-release gate.

## Update-check regression

Verify that Home becomes usable before any release request starts. A successful
Home render may trigger one lazy GitHub Releases check, while a cached attempt
newer than 24 hours must suppress network work. Test current, available, offline,
error, manual-refresh supersession, and stale callback rejection. On a physical
legacy TV, confirm the request remains non-blocking and the QR code is readable.

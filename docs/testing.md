# Testing

Install the development-only verification tools, then run the complete local
CI workflow:

```sh
npm ci
npm run verify
```

This first rejects stale generated `app/app.js` or `app/player.js`, parses every
delivered runtime JavaScript file and both generated bundles as ECMAScript 5, then runs
ESLint, JavaScript type-checking, unit tests, repository baseline checks, and
shell asset validation. Node.js is required only for development, tests, and
packaging; it is not required by the installed TV application.

CI and tagged releases also run `npm run check:deps`, which queries the npm
registry and fails on unaddressed high or critical dependency vulnerabilities.
It remains separate from `npm run verify` so the local verification suite can
run without network access.

After editing a coordinator, Player-manifest module, or loader, regenerate both browser bundles:

```sh
npm run build:app
npm run verify
```


Every file under `app/coordinator/` must also parse independently:

```sh
for file in app/coordinator/*.js; do node --check "$file" || exit 1; done
```

Generated `app/app.js` and `app/player.js` are excluded from direct lint/type and
source-owner inventories. Their bytes are checked against the independently linted
and type-checked authored sources before any tests run; both still undergo ES5,
budget, freshness, and release-asset checks.



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
`webos-service/`, including generated `app/app.js` and `app/player.js`, with the ECMAScript 5 parser
mode. It also rejects `Promise`, which is syntactically valid ES5 but prohibited
by the Chrome 53 runtime contract. Tests, build scripts, and ESLint configuration
remain Node-only tooling and may use modern JavaScript.

The parser is a development-only dependency. It is not bundled into the TV
application and does not change the dependency-free runtime.


### Production startup bundle gate

Development keeps the modular `app/index.html`; the IPK stage uses a generated `core.js`. Run the
focused retain test after changing script order, the minifier, packaging, or separate subtitle assets:

```sh
node tests/test-production-runtime-bundle.js
```

The test stages the real application, preserves canonical script order, requires Chrome-53 ES5,
keeps ASS/SSA runtime/worker assets separate from the production core bundle, rejects a script-count
reduction below 75%, and rejects an aggregate startup-gzip increase above 5%. On legacy TVs the
separate worker may be initialized at runtime by `startup-metrics.js` only when global local ASS/SSA
rendering is enabled; with ASS disabled startup worker/prewarm must be skipped. It is not folded into
`core.js`. After the September 6 Player split, the production-bundle test reports
105 -> 4 local startup scripts and 401,913 -> 331,782 aggregate initial gzip bytes.
`player.js` remains separate, unchanged, required, and absent from static startup.
The deferred asset inherits the same content cache key as `app.js`.

Focused Settings-backup lifecycle coverage is in
`tests/test-settings-backup-interaction.js` and `tests/test-settings-backup-lifecycle.js`;
see the [boundary review](cleanup/2026-09-06-settings-backup-boundary-review.md)
for the retained owners and accepted-write behavior.

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

The unit runner keeps one Node process per `tests/test-*.js` file but schedules up to four
independent processes concurrently by default. For deterministic troubleshooting or comparison
with the historical serial runner, use:

```sh
PLOFF_TEST_JOBS=1 npm run test:unit
```

Set `PLOFF_TEST_JOBS` to another positive integer only when the host has enough CPU/memory; CI and
local correctness must not depend on a specific worker count.

Each completed file reports elapsed milliseconds. While work is active, a report every 15 seconds
identifies the running files and their elapsed times; child output remains grouped by completed file.
Set `PLOFF_TEST_PROGRESS_MS=0` to disable progress, or a positive millisecond interval to adjust it.

Per-file timeouts are **disabled by default**, including for real ASS worker tests. For diagnosing a
stuck suite, explicitly set `PLOFF_TEST_TIMEOUT_MS` to a positive millisecond limit appropriate to that
suite. On expiration the runner fails, stops scheduling queued files, force-terminates that test
process, preserves its captured output, and drains other already-running tests. The limit applies to
the direct test process, not a general descendant-process supervisor. Zero disables it; invalid,
negative, or out-of-range timer values use the default. Library callers may supply `progressMs` and
`timeoutMs` options instead. All runner-owned timers are cleared when their work settles.

PlaybackController regression coverage is split by behavior rather than kept in one monolithic test:

- `tests/test-playback-controller-core.js`: ownership/startup/seek/terminal/Direct Play behavior;
- `tests/test-playback-controller-subtitles.js`: local subtitle runtime/editor and ASS/SRT ownership;
- `tests/test-playback-controller-recovery.js`: buffering/recovery/diagnostics/internal reopen behavior;
- `tests/helpers/playback-controller-harness.js`: fixture/timer/video construction only.

The three suites contain the same 149 named regression cases that previously lived in the single
PlaybackController test file. Event ordering remains explicit inside each test; do not move LG/webOS
seek/buffer/subtitle sequences into opaque shared helpers merely to reduce test length.

PlayerFeatureController regression coverage follows the same ownership-oriented pattern:

- `tests/test-player-feature-presentation.js`: presentation/wiring/control/Up Next behavior;
- `tests/test-player-feature-queue.js`: playlist/container/adjacent/gap ownership;
- `tests/test-player-feature-settings.js`: subtitle editor, scoped preferences, quick controls and version selection;
- `tests/helpers/player-feature-controller-harness.js`: fixture/DOM/controller construction only.

The split preserves all 87 named PlayerFeatureController regression cases exactly once. Keep command/event
sequences and assertions in the domain suites rather than moving behavior into the shared fixture.

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
Recently Added, Playlist, and Collection pages. `tests/test-plex-media-document.js`, `tests/test-plex-media-mapper.js`,
`tests/test-plex-client-media-parsing.js`, and `tests/test-plex-client-media-document-runtime.js`
prove that playback and media detail share one ordered Media/Part/Stream traversal and one pure
attribute-to-record mapper, while
`tests/test-track-normalization.js` freezes the common playback-facing track record.

`tests/test-plex-http.js` freezes success, status, network, timeout, deferred synchronous failure,
and abort semantics across Plex transports. The audited failure-path regressions additionally verify that
compound watched/progress mutations expose partial success without falsifying the resume point, initial
stream-selection failures prevent playback readiness, failed timeline writes are not acknowledged as
persisted, library/metadata refresh operations return cancellable handles, and a failed first settings-backup
summary write removes only the technical playlist created by that attempt. `tests/test-media-choice-model.js` freezes the
track/version values consumed by Detail and Player, and `tests/test-search-text.js` freezes the
normalization shared by local and cloud search. `tests/test-media-info.js` verifies that technical
track labels use the same localized presentation formatter as the selection surfaces.

Playback compatibility tests cover persistent format rules, thirty-day file
exception expiry, bounded storage, and the forced-Direct fallback to Automatic.

Queue suites additionally cover malformed and oversized Plex pages,
synchronous transport exceptions, monotonic terminal discovery, exact duplicate
occurrence restoration, and invalidation of an adjacent result when playback moves
to another episode inside the same series generation.

Install the lockfile-pinned development dependencies before running the pipeline.
If installation or an individual gate cannot run in a particular environment, record
that limitation in the verification log and execute only explicitly named fallback
checks. Never infer that an unexecuted command passed.

A clean ZIP check must also verify its SHA-256 checksum, ZIP integrity, exact HEAD,
clean working tree, `git fsck --no-dangling`, and current generated artifacts after re-extraction.
Preserve executable modes and symlinks. Exclude `dist/`, `build/`, linked-worktree metadata, IPK,
caches, and temporary files. Source-only archives omit `node_modules/`; explicitly requested
offline checkpoints include the lockfile-pinned, untracked dependencies. Verification logs and
checkpoint metadata may accompany the project at the archive root, not as runtime source.

## Deferred Player startup regression tests

`tests/test-player-runtime-loader.js` runs the actual ES5 loader against a controlled script DOM.
It covers coalesced loads, synchronous preloaded/ready paths, retained failures, explicit reset,
missing composition, script insertion errors, callback reentrancy, generation isolation, destruction,
and current-app cache identity. Metrics hooks cannot interrupt readiness, and one throwing consumer
cannot starve other queued consumers. Destruction deliberately suppresses outstanding callbacks;
a new call after destruction receives a bounded destroyed error.

The loader was prepared separately; Core inclusion, bundle separation, composition,
first-Play handling, post-Home warm, and release guards are activated together.
`test-player-bundle-boundary.js` executes the real Core script graph and deferred
bundle in a browser-style VM; `test-player-composition.js` checks the implementation
map and real feature creation. `test-player-startup.js` covers nullable Core, races,
identity/selection changes, early Play, silent warm failure, and reverse destruction.
`test-player-cold-queue-routing.js` preserves early remote/pointer playlist and
collection capture without retaining DOM events or copying queues into Core.
`test-player-construction-rollback.js` and `test-playback-construction-rollback.js`
exercise real owner creation and partial binding/translation failure. The existing
Playback and Player domain suites remain mandatory.

`test-generated-player-guards.js` rejects stale/missing Player output, proves source
inventories ignore only generated artifacts, and checks that Player-only changes
alter the shared cache identity. Production staging and shell-asset tests reject
missing, empty, or statically loaded Player assets. `test-player-startup-metrics.js`
checks the three first-write-wins numeric Player milestones.

### Measured final maintenance checkpoint (not TV timing)

| Metric | Clean `caebbe4` baseline | Final maintenance checkpoint |
| --- | ---: | ---: |
| Initial development scripts | 129 | 105 |
| Initial JavaScript bytes | 2,208,899 | 1,747,552 |
| `app.js` raw / gzip bytes | 899,927 / 177,658 | 534,196 / 106,346 |
| Deferred `player.js` raw / gzip bytes | Not applicable | 450,337 / 90,910 |

The final maintenance checkpoint passed all 227 unit-test files and the full
`npm run verify` pipeline. Its memory gate retained 0/200 payloads and 0/100 runtime
payloads, with +0.08 MiB net heap growth. Git diff/integrity checks also passed.

Existing Core/startup/CSS guardrails are unchanged. Player has its own explicit
550,000 raw / 115,000 gzip byte guardrails. CSS remains 244,834 raw / 36,981 gzip bytes.
The initial JavaScript reduction is about 21%; it does not establish smoother TV
navigation or improved playback latency.

Physical LG acceptance remains pending: compare the same baseline and new package
for `bootstrap -> first-focusable-ui`, navigation during the one-second Player warm,
ASS warm/first-frame timing with local ASS both on and off, first Play before warm,
playlist/collection/extras entry, resume and Back, and the existing complete Player
matrix. Record code-ready and feature-ready separately. No physical release-signoff
checkbox or retained TV evidence is changed by these automated results.

## Persisted-state and lifecycle regression tests

Settings persistence is tested as an upgrade path, not only as validation of the current
shape. `tests/fixtures/settings/v1.json`, `v2.json`, and `v3.json` freeze local Settings shapes.
`tests/fixtures/settings-backup/` freezes saved-settings interchange versions, including split v2
shared/device playlists and current v3 device snapshots. `tests/fixtures/compatibility/` freezes
compatibility-memory v2/v3 records. Add a fixture whenever a future change would otherwise require
reconstructing an old persisted or transferred shape from memory.

`tests/test-application-composition.js` proves that a cold start migrates persisted Settings
before feature construction, onboarding saved-settings loading replaces shared state before Home,
server switching suspends Settings and reloads through the server owner, account disconnect/reset
delegates to the server boundary, and playback identity is published/cleared through the shared
application session. `tests/test-settings-controller.js` separately covers live theme changes plus
same-device recovery and another-device imports, including model-dependent compatibility-memory
behavior.

`tests/test-playback-compatibility-memory.js` freezes compatibility schema migration, bounded
metadata, rule/file limits, expiry, and provenance (`observation`, `derived`,
`user-override`). `tests/test-settings-backup-format.js` and
`tests/test-plex-settings-backup-store.js` verify that compatibility data crosses saved-settings
boundaries only when allowed.

Diagnostics tests form an explicit privacy gate. `tests/test-support-snapshot.js` requires the
allow-listed Settings/compatibility summary and simultaneously proves that Plex tokens and local
IP addresses cannot enter serialized or QR/mail report bodies. Controller/feature tests verify
that those providers are wired through the composition root rather than reading storage directly.

The generated-artifact checks are also lifecycle guards: `npm run check:styles` and
`npm run check:app-bundle` fail when source changes have not been rebuilt, so a green
`npm run verify` proves the checked-in runtime artifacts match their authoritative sources.

Theme regression coverage is registry-driven. `tests/test-theme-registry.js` freezes the
registered IDs and Settings acceptance; `tests/test-theme-styles.js` validates every registered
stylesheet, required semantic tokens, selector scoping, generated order, single-stylesheet runtime,
and script ordering. The shipped set is `classic`, `immersive`, `premiere`, `nova`, and `atelier`;
adding another theme must update the registry expectations and keep all theme contracts green.

## Full Library catalog benchmark

Catalog performance work is measured with the permanent deterministic benchmark:

```bash
npm run benchmark:library-catalog
```

The default run uses 5,000 synthetic items and repeated focus, same-window scroll,
one-row scroll, and page-append scenarios. Operation counts are the primary signal;
Node timings are secondary and must be compared only with runs using the same workload
and environment. The active optimization history and benchmark logs are recorded in
`docs/catalog-performance.md` and `docs/benchmarks/`.

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
jobs. It also runs a focused playback lifecycle that exercises `PlaybackSession` reopen/seek
state, `PlaybackTimeline` reporting and keepalive timers, ASS renderer disposal, subtitle editor
Apply/Cancel transitions, and `PlayerQueueController` artwork scopes. The gate combines:

- deterministic teardown checks for cache records, callbacks, handlers, XHR aborts,
  artwork jobs, image handlers, preload ownership, Timeline intervals, ASS renderers, and queue
  artwork scopes;
- a positive WeakRef sensitivity check using one intentionally retained runtime payload, followed
  by `WeakRef` checks proving destroyed standard and runtime lifecycle payloads are collectable;
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
   From a full catalog beyond the first pagination window, open Detail and Back;
   the exact card and viewport must remain selected without restarting the catalog
   load or losing focus while navigation input continues.
4. Open movie, show, season, and episode Detail from Home, Search, Library, Watchlist,
   and playlist origins. Verify theme-audio continuity, watched/Watchlist mutations,
   and Back restoration from Player settings without stale content. Enter More Details
   and verify the lower pane remains fully aligned after the vertical snap; cast/extras
   Left/Right navigation must preserve visible focus without re-anchoring or clipping
   the pane after the animation settles. Version must stay
   first and remain clickable with one file; its inline information affordance must not
   become a separate focus target. In the version browser verify Left/Right preview
   without mutation, two technical columns, scrolling into the fixed Cancel/Apply
   footer, Back as Cancel, one-file Cancel-only behavior, and commit only from Apply.
   From card long-press actions verify an untouched movie/episode exposes **Mark watched** only,
   a partial item exposes **Mark watched** then **Mark unwatched** plus clear-progress/play-from-start,
   and a completed item exposes **Mark unwatched**. Clear progress must remove the resume point after
   refreshing Plex state. **Remove from Continue Watching** must appear only for a card actually opened
   from Continue Watching. On a partially watched Detail, open the `...` media-options menu and verify its first entry is the watched action complementary to the visible main button: **Mark watched** when the main button is **Mark unwatched**, or **Mark unwatched** when the main button is **Mark watched**. Applying it must clear the resume point. On episode Detail, verify
   each preview card shows a lower-left duration badge as `MM:SS` when shorter than one hour, `H:MM:SS`
   without zero-padding the hour when longer, and `--:--` when duration is missing/non-positive; the watched
   indicator must remain in its existing position. Verify the episode artwork is visibly taller (168 px at the
   reference layout), the 44 px title caption remains below it rather than cropping it, the preview row has moved
   upward rather than extending farther down, and the duration badge sits 6 px above the lower artwork edge.
   The 6 px playback-progress bar must begin immediately below the artwork, consuming the top of the 44 px
   caption area rather than covering the image or crowding the duration badge. Also verify metadata refresh plus whole-season watched/unwatched
   confirmation, fresh season reload, and visible partial-failure reporting.
5. Test Direct Play, Direct Stream, Auto fallback, Direct only, and Force transcode
   with 1080p SDR and supported 4K HDR10 material. Confirm diagnostics and bounded
   recovery match the effective delivery mode. In Direct Play and in an offset-based Direct
   Stream/transcode session, reproduce both a sub-500 ms network interruption and a longer visible
   buffering event. The progress bar must freeze immediately, `canplay` alone must not release it,
   and playback must resume with video, public time, Plex reporting, and local subtitles on one clock.
   Repeat two independent buffering incidents in the same episode: each may perform at most one
   bounded checkpoint rebuild, and the second must not be disabled by recovery of the first. When the
   effective delivery is Direct Play, both buffering repair and clock repair must remain Direct Play;
   Direct Stream is permitted only after confirmed compatibility evidence makes Direct Play unusable.
6. Test Resume, Play from beginning, Cancel, forward/backward seek, seek before the
   current transcode offset, repeated seek, rebuild, and recovery without losing the
   absolute playback position. During a visible buffering event, pause and resume once, then repeat
   with a committed backward and forward seek: pause must preserve the frozen checkpoint, while the
   seek must supersede it and land on the requested absolute target without a late buffer timer moving
   playback back to the old point. In a Direct Play session, exercise seek timeout, seek mismatch,
   repeated seek while the cold-reopen guard is active, and terminal-window seeks: diagnostics may show
   `REOPEN[...]` followed by `RETRY[...]`, but none of these conditions may consume Direct Stream while
   Direct Play remains technically usable. Also seek while the very first source is still loading,
   before stable playback has begun, and repeat after the first native `play()` request but before the
   first confirmed `playing`: the replacement must preserve startup autoplay and resume on its own rather
   than interpreting the native element's pre-start/pending-play paused state as a user pause.
7. Change audio, subtitles, and media version. Exercise advanced SRT/WebVTT and external/embedded ASS/SSA
   synchronization, size, loop, Apply, and Cancel while playing and paused. For local ASS/SRT, reproduce a
   chapter seek whose requested target has a subtitle but whose actual Direct Play decode settles on an earlier
   keyframe: while paused the target subtitle must stay hidden until Play and decoder movement; while already
   playing with no rebuffer the exact target sample must also remain hidden until rollback or genuine forward
   native progression. A normal no-rollback seek must then reveal subtitles promptly once the native clock moves.
   Cycle subtitle size through the
   existing 75/100/125/150% steps and the added 175/200% steps from both Player and advanced editor; verify
   200% is actually rendered and persists/restores correctly for both local SRT/WebVTT and ASS/SSA.
   With embedded ASS/SSA selected, verify Advanced Subtitle Settings opens; offset, loop and timeline
   remain usable; size is enabled only while the local ASS renderer owns the pixels; background and
   edge remain visible but disabled. Switch ASS -> SRT -> ASS and confirm capability/focus state changes
   immediately without losing the saved SRT appearance or local ASS size. With local ASS active, seek to a
   chapter whose requested target has a nearby earlier keyframe and verify both decoder-settlement shapes:
   rollback already visible in `seeked`, and rollback first visible on a later `timeupdate`. In both cases the
   stale ASS frame from the optimistic target must disappear immediately and the next subtitle must be chosen
   only from the accepted decoded clock. Repeat in Force Transcode:
   timing must use Plex's server offset while size/appearance stay disabled, and the same offset must
   restore if local ASS ownership is enabled later. Apply timing to season while Plex owns the pixels
   and confirm the season timing becomes effective without deleting the current media's saved local ASS
   size or SRT size/background/edge. Toggle both global local-renderer controls from the advanced editor in both directions:
   each ON/OFF action must show only Yes/No, default safely to No, treat Back as No, and explain that
   the change is global. Confirmed renderer changes must survive Cancel because they are global, while
   scoped track/style/offset drafts still obey Apply/Cancel/Reset semantics.
   Open the advanced editor, let playback move both forward and backward from the captured point, then
   verify both Apply and Cancel restore that captured position. Switching SRT/WebVTT or ASS/SSA between
   local and Plex/server ownership must rebuild from a freshly resolved playback plan, preserve the
   absolute timeline, and still allow seeking backward below any previous transcode/direct-stream
   offset as well as forward afterward. When the selected track combination remains Direct-Play-capable,
   stream switching and restore must keep Direct Play: a nearby keyframe rollback may be adopted by the
   bounded decoder settlement, but the restore/rebuild must not trigger an unnecessary Direct Play ->
   Direct Stream recovery fallback or leave video, timer, Plex reporting, and local subtitles on different
   clocks. Confirm that a track combination that genuinely requires server handling may still select the
   corresponding Direct Stream/transcode plan. Repeat
   around a real buffering event. For ASS/SSA in Automatic or Direct playback, verify
   JavascriptSubtitlesOctopus follows the same absolute clock through play, pause, seek, buffering,
   and stream rebuild. During both short and long buffering, the ASS bitmap/timing and progress bar
   must freeze and resume together; neither may remain persistently ahead or behind after pause/resume
   or a subsequent absolute seek. Verify that +/- timing changes update the renderer without assigning the native
   video source or current time. While a static ASS subtitle is visible, seek both backward and forward:
   landing inside the same exact rendered `[validFrom, validUntil)` state must keep the bitmap visible,
   while landing before `validFrom` or at/after `validUntil` must clear it immediately rather than leave
   the old subtitle stuck until the next boundary. Exercise at least one animated/karaoke ASS segment,
   including pause, resume, forward/backward seek, and entry/exit around the karaoke boundaries. Repeat with Force
   Transcode and verify ASS/SSA stays on Plex burn-in while Advanced Subtitle Settings remains available
   for track selection and timing. Size/background/edge must be disabled; an embedded ASS offset must be
   previewed through the Plex stream offset, mirrored into the local offset store on Apply, and restored to
   the pre-editor Plex value on Cancel without erasing the saved local offset.
   PGS/VobSub and other image subtitle editing must remain clearly disabled. While local ownership is
   actually active, verify the compact Player summary shows the localized `SRT / WebVTT · LOCAL` or
   `ASS / SSA · LOCAL` badge using the same font size, normal weight, and line-height as the nearby Audio/Subtitles
   summary rows, with 6 px of breathing room above the pill; the badge must disappear for Plex/server/native ownership, Force Transcode, loading, and subtitles-off states.
   Confirm that this spacing does not increase the Player controls height or shift the quality/delivery summary on the opposite side.
8. Exercise playlist and episodic queues. The drawer must render content, identify the
   playing item, show the same lower-left episode-duration badge (`MM:SS`, `H:MM:SS`, or `--:--`), keep the
   watched marker at bottom-right, and keep the focused item no lower than the penultimate visible position
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
   held and do not propagate unwanted navigation after receiving focus. With controls
   hidden or in compact timeline mode, press remote OK while Skip Intro and Skip Credits
   are each visible: the marker must activate directly without expanding full controls.
   After activation, verify the prompt stays hidden through the seek and any small
   decoder/keyframe rollback into the consumed interval; it may become eligible again
   only after playback has exited that marker interval and later re-enters it.
10. Exercise Chapters, progressive thumbnail upgrades, Previous/Next across regular
    seasons, playlist advance, Back, and Stop. Include one chapter with no Plex `thumb` and, if practical,
    one failing/404 thumbnail: both must remain a plain theme-aware placeholder at 70% opacity with no browser broken-image
    glyph, while valid thumbnails still progressively replace the placeholder. Verify that a queue opened from Specials
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
    profiles/playback must remain usable where supported, and settings must not reset. For playback,
    include one brief interruption that does not show the spinner and one interruption longer than
    500 ms that does; semantic clock freeze must be immediate in both cases.
13. Open User diagnostics and verify current/last playback, local server identity,
    capabilities, strategy, buffered ranges, errors, polling teardown, raw native time, derived
    native-plus-offset time, buffering checkpoint, recovery reason/delta/acceptance, and cumulative
    repair count. Capture once while buffering and again after recovery; the latter must retain the
    originating checkpoint and final outcome. No Plex
    token, authenticated URL, or complete machine identifier may appear.
14. Test poster sizes at 70%, 100%, and 130%; artwork quality at 70%, 90%,
    and 100%; backdrop quality at 50%, 85%, and 100%; overscan; requested artwork
    resolution; every supported interface language; player accessibility labels; empty/error states; and focus
    visibility with both remote and pointer input.

The `1920x1080` manifest resolution is the application UI canvas. On UHD TVs,
webOS can still decode a 3840x2160 video surface; actual Direct Play and HDR
support depends on the model and source codecs.

## Buffering-clock physical drill

Use media with easily recognizable scene changes and, for subtitle checks, an external static ASS
track with frequent dialogue. Run the same drill first in Direct Play and then after resuming or
seeking far enough into Direct Stream/transcode that diagnostics show a non-zero `offsetBase`.

1. Establish a control point: let playback run normally for at least 30 seconds and compare the
   visible scene, Player elapsed time, timeline thumb, and ASS dialogue.
2. Interrupt network delivery for less than 500 ms. The spinner is allowed to remain hidden, but the
   timeline and ASS clock must stop immediately if playback actually stalls. When native time moves
   again, all three surfaces must resume together without a source rebuild for a plausible sample.
   Repeat once while watching diagnostics: even if webOS omits or delays `waiting`, a native
   `readyState` drop below 3 must not allow the first suspect `timeupdate` to move the public clock.
3. Interrupt delivery for 2-5 seconds. The spinner should appear after its visual grace period. The
   elapsed time, timeline thumb, and ASS state must remain at the last confirmed point until validated
   recovery. `canplay` without `playing` must not visibly advance them.
4. While the longer interruption is active, press Pause. The spinner may hide, but the checkpoint must
   remain frozen. Resume and verify that playback either accepts a plausible native sample or performs
   one checkpoint rebuild; it must not jump to a different scene or leave ASS/timeline behind. This must
   also recover if that webOS run resumes with advancing `timeupdate` events but omits a second `playing` event.
5. Repeat the longer interruption and commit an explicit backward seek, then a forward seek. Each seek
   must cancel the old buffering checkpoint, land at its requested absolute point, and remain there;
   no delayed recovery may return to the pre-seek position.
6. In the non-zero-offset stream, watch specifically for offset double-application. A resume near
   `20:00` must stay near `20:00`, never jump by another 20 minutes. If webOS briefly exposes native
   time in the absolute domain, Ploff should hold the last confirmed time for about 400 ms and then
   either accept a normalized sample or rebuild once at that checkpoint. After a rebuild, the first
   visible ASS state must match that checkpoint immediately; no prepared frame from the rejected
   clock/source may remain on screen.
7. Trigger two clearly separate buffering events several minutes apart. Both must recover. A repair in
   the first event must not permanently disable recovery for the second, and one event must never loop
   through repeated source replacements.
8. Repeat with local SRT/WebVTT, local static ASS, subtitles off, and Plex/server subtitle ownership.
   Also exercise one animated/karaoke ASS segment; the rendering paths differ, but every mode must use
   the same validated public playback time.
9. After each event, use Pause/Resume and one absolute timeline seek as a post-check. A small decoder
   keyframe correction may move the shared clock within the existing bounded tolerance, but video,
   timeline, Plex reporting, and subtitles must move together and remain stable afterward. If the
   accepted correction moves backwards across an ASS boundary, the subtitle state must also move
   backwards immediately rather than remaining blocked by the previous static-state barrier.
10. Open User diagnostics immediately after a recovered event. Confirm the clock line contains offset,
    raw native, derived absolute, buffer checkpoint, recovery reason, delta, and acceptance. For a
    persistent impossible sample, the source may be rebuilt once at the checkpoint and repair count may
    increment; for an ordinary sample the reason should be `accepted`, and for a transient bad first
    sample followed by a good one it should be `transient-recovered` with an initial reason.
11. Perform a 30-60 minute soak with at least two induced interruptions, one track switch, pause/resume,
    and bidirectional seek. Confirm no persistent desynchronization, source-rebuild loop, stuck spinner,
    accumulating timeline lead, or subtitle drift.


## Coordinator and Player Physical Checkpoints

Automated extraction checks do not replace TV behavior. After Player/coordinator changes, verify Direct Play, Direct Stream, transcoding, resume, forward and
backward seek, seek before the current offset, rebuild/recovery, audio,
subtitles, version changes, subtitle synchronization, chapters, skip prompts,
Previous/Next, playlist queues, queue drawer focus, both Up Next layouts,
Back/Stop, and Magic Remote timeline input. Verify that closing playback restores
the correct Home, Library, Detail, or playlist origin and current queue item.
For local text subtitles, cycle Shadow, Outline, Outline + shadow, and the Double
outline plus shadow mode, checking the live preview, readability, seek, buffering,
and reopening the same media. Exercise Advanced Subtitle Settings Apply and Cancel after
playback has moved away from the editor-open position; a natively seekable Direct Play
restore must not replace the source or advance to Direct Stream, and any bounded keyframe
rollback must leave video, timer, reporting, and subtitles on one settled clock. Also exercise
Direct Play terminal seeks, buffering/clock repair, seek timeout/mismatch, and a DP-capable
subtitle stream switch: these recovery events must remain Direct Play. Capture the full recovery
trace; `FALLBACK[...] > DS` is expected only after a confirmed Direct Play compatibility failure.
Keep the standard Plex subtitle path as the control case.

After composition-root or cross-feature wiring changes, repeat startup/onboarding, profile
selection, Home focus restoration, navbar long-press, Search T9, Library,
Watchlist, Detail, Settings, Diagnostics, network recovery, and the complete
Player matrix. Record physical results separately; local tests must not mark
these checkpoints complete.

For every physical-TV problem, record the exact reproduction path,
expected behavior, observed behavior, playback mode, and any visible log or
diagnostic evidence before changing code.

## Release metadata gate

Before physical signoff or tagging, keep the same stable `x.y.z` version in
`package.json`, the root project record in `package-lock.json`, and
`webos-shell-app/appinfo.json`, then run:

```sh
npm run check:release-metadata
npm run test:pre-release
npm run release:package -- --dry-run
```

The tagged workflow runs `scripts/check-release-metadata.js "$GITHUB_REF_NAME"` before
signoff validation, packaging, or publication. A tag must be exactly `vX.Y.Z` for the
coherent metadata version. Version bumping and tag creation remain explicit developer
actions rather than build side effects.

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
Scan it with a phone and verify that it opens a local mail draft whose report
contains the application version, LAN/internet state, failed media's file,
Direct Play/Direct Stream/transcoding mode, video details, selected
audio/subtitle tracks, fallback attempts, bounded JavaScript errors, and redacted
error text. Repeat after a clean playback with no error and confirm that the last
played media is used instead.

## Client response exception boundaries

`tests/test-plex-response-callbacks.js` exercises 23 public Auth, Plex, and Watchlist
response paths through the real clients, parsers, and shared HTTP implementation.
Its 92 cases distinguish successful parsing, malformed responses, HTTP failures, and
throwing consumers. Completion remains once-only, consumer exceptions retain their
identity, and XHR callbacks are detached before control returns to feature code.

`tests/test-plex-auth-contract.js` locks the supported Auth surface and verifies
credential-free identity probing, mismatched-identity fallback, and cancellation
after advancing to another approved candidate. The removed local-token fallback
had no production callers and was already forbidden by the TV-shell security guard.

## Media-model identity and recommendation boundaries

`tests/test-media-identity-maps.js` exercises nine real-model cases covering local
and cloud search, search parsing, Home merging and XML results, Watchlist resolution,
subtitle-language labels, and recent-season grouping. Synthetic identifiers such as
`constructor` and `__proto__` must not disappear or alter counts. These are robustness
fixtures, not claims that normal Plex IDs have those values. Duplicate selection,
input immutability, ordering, and output record shapes remain covered.

`tests/test-plex-home-model.js` parses actual XML with the real mapper. It locks hub
priority, deterministic source-order ties, movie/show eligibility, watched filtering,
empty/invalid responses, global flat deduplication, and independent row deduplication.

## Native discovery lifecycle

`tests/test-discovery-service-lifecycle.js` executes the actual service source and
GDM parser with controlled native dependencies. Its 12 cases cover multicast/broadcast
protocol, packet filtering, identity deduplication, early errors, timer release,
retained callbacks, late binding, setup/send/close failures, and concurrent requests.
The source and packaging checks in `test-discovery-service.js` remain enabled.
`test-gdm-parser.js` checks integer port validity, bounds, default port, and address
requirements. Physical-TV GDM discovery is still part of the release matrix.

## HLS player clock regression and device acceptance (2026-09-06)

The following suites execute real controller/session/reposition/timeline/subtitle
owners. Only native media, Plex responses and the renderer output boundary are
controlled; they are not a browser decoder or physical-LG test.

- `test-playback-controller-source-clock.js`: ten source readiness, stale callback,
  fractional target, worker reuse, pause-intent and close traces.
- `test-playback-source-lifecycle.js`: assigned/ready source lifecycle and retirement.
- `test-playback-reposition-hls.js`: seven bounded, same-source policy groups.
- `test-playback-controller-hls-clock.js`: eighteen DS/TC/safe-TC native seek, decoder
  rollback, ASS epoch, buffering, timeout and supersession traces.
- `test-playback-delivery-matrix.js`: 33 DP/DS/TC/safe-TC delivery and caption scenarios,
  Plex remux/audio/video decision labels, source replacement, track changes and
  terminal seeks preserving the pre-terminal user play/pause intent.
- `test-playback-editor-clock.js`: twelve cross-delivery ASS preview buffering, pause,
  seek, Apply and Cancel traces.
- `test-subtitle-runtime-preview-clock.js`: active/closed/text preview clock ownership.

The prior DP behavioral suites remain unchanged. The TV shell source-layout guard
follows the shared source-switch helper and continues checking retirement order.

### Required physical follow-through for this change

This is an additional acceptance drill, not a replacement or PASS for the existing
release matrix. Keep the current physical-TV release gate and its historical records.
Use the same media/ASS track that reproduced the reported issue. Record actual
delivery from diagnostics, not only the requested quality label.

1. Reconfirm the user's DP reference: cold start/resume, forward/backward seek,
   seek while paused, and buffering with ASS. Compare picture/dialogue, native time,
   public time and caption timing; do not accept a DP regression to fix HLS.
2. Repeat with automatic fallback to transcode plus local ASS, Direct Stream/remux,
   audio-only conversion where supported, and conservative transcoding. In each,
   test both already-buffered seeks and far seeks that replace the source.
3. Include fractional requests, several rapid opposite-direction seeks, waiting
   immediately before/after seeked, and a source replacement before the previous
   one has resumed. No old frame/clock may authorize a new source.
4. Test ASS external and embedded, SRT, server-rendered subtitles, and off. Check
   positive/negative subtitle offsets. Server burn-in cannot be independently
   retimed by the client, and forced-transcode subtitle policy remains unchanged.
5. Open the ASS timing editor; adjust the draft, seek, force buffering and pause,
   then Apply/Cancel. Verify the same renderer/offset domain, no preview position
   reported to Plex, and correct restored position and pause intent.
6. Change audio/subtitle tracks, enter the final-five-second terminal guard, seek
   backward again, close while buffering/preparing, and open the next item.

If sync still fails, use the existing bounded playback debug capture around one
reproduction. Inspect delivery, offsetBase, nativeTime, publicTime, buffering,
streamSwitching, seek targets, `decoder-settlement-*`, `source-*`, and ASS epoch
events. A consistent visible-frame error with apparently consistent clocks may
require real Plex segment/timestamp evidence; never guess an offset from one sample
or claim that these synthetic tests prove server timestamps or TV frame timing.

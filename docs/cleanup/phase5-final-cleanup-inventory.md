# Final Cleanup Phase 5 Inventory

Baseline commit: `93f642c3` (`Complete composition and Plex compatibility cleanup`)
Behavior baseline: `33897353`

## Baseline measurements

- generated `app/app.js`: 899927 raw / 177658 gzip bytes at the Phase 4 verification gate;
- development startup: 129 / 130 local scripts, 2208997 / 2210000 aggregate JavaScript bytes;
- `PlaybackController`: 2957 lines / 144715 bytes;
- `PlayerFeatureController`: 2841 lines / 136675 bytes;
- `ApplicationController`: 1765 lines / 101002 bytes;
- `DetailFeatureController`: 1812 lines / 86067 bytes;
- `PlexClient`: 1333 lines / 55552 bytes;
- Phase 4 final memory gate: 0/200 weak payloads, 0/100 runtime payloads, +0.03 MiB net heap growth.

The largest regression suites are:

- `tests/test-playback-controller.js`: 4619 lines / 259426 bytes;
- `tests/test-player-feature-controller.js`: 2590 lines / 140874 bytes;
- `tests/test-detail-feature-controller.js`: 1561 lines / 92838 bytes;
- `tests/test-plex-client.js`: 1301 lines / 74599 bytes;
- `tests/test-application-composition.js`: 1235 lines / 59915 bytes.

`tests/test-playback-controller.js` contains exactly 149 named IIFE regression cases. Its natural boundaries are:

1. core/startup/seek/terminal/direct-play behavior through `startupDirectPlayRollbackCannotStrandStreamSwitching`;
2. local subtitle/runtime/editor integration from `subtitlePreviewSuppressionAndRestore` through `cancellingEditorAfterGlobalAssEnableKeepsTheNewGlobalRendererState`;
3. close/buffering/recovery/diagnostics/internal-reopen behavior from `closeAndDestroy` onward.

The existing fixture/timer/video harness is confined to the first 308 lines and can be extracted without hiding individual event sequences.

## Runtime file reachability

Development `app/index.html` loads 129 local JavaScript startup assets. `scripts/build-app.js` bundles the 38 `app/coordinator/*.js` modules into generated `app/app.js` rather than loading those files directly.

JavaScript files not directly referenced by `app/index.html` classify as follows:

### Bundled production modules - retain

All files listed in `scripts/build-app.js::MODULE_FILES` under `app/coordinator/` are production code and are represented by `app/app.js` at runtime.

### Lazy runtime assets - retain

- `app/vendor/subtitles-octopus.js`: loaded on demand by `libass-subtitle-renderer.js`;
- `app/vendor/subtitles-octopus-worker.js`: lazy modern worker asset retained by production packaging checks;
- `app/vendor/subtitles-octopus-worker-legacy.js`: legacy Chrome/webOS worker loaded/prewarmed through the ASS runtime/startup metrics path and paired with its external memory asset.

These are Class B platform/runtime assets, not startup orphans.

### On-demand diagnostics - retain

- `app/debug-capture.js`;
- `app/debug-timing-probe.js`.

Both are intentionally absent from normal startup. Tests and `docs/diagnostics.md` require explicit Web Inspector loading. They remain valuable for physical-TV source/seek/subtitle investigations and are Class B diagnostics.

### Proven orphan candidate

`app/setup-server-session.js` is not loaded by `app/index.html`, not included in the coordinator bundle, and has no production reference to `PloffSetupServerSession` or `SetupServerSession`. Its only current consumer is `tests/test-setup-server-session.js`. Git history shows it predates the current `SetupFeatureController` ownership. Current setup creates `SetupController` without a `serverSession` option; server discovery/account-server lifecycle is owned by the feature/server/account ports.

The related optional `values.serverSession.cancel()` branch in `SetupController.cancelSessions()` therefore has zero production provider. This family was confirmed Class A by a RED source-contract test in `tests/test-setup-controller.js`, then removed. `SetupController.cancelSessions()` now owns only the active authentication-session cancellation hook.

## Legacy/diagnostic marker classification

Repository-wide marker search was reviewed rather than deleting by keyword:

- Direct Play/Direct Stream `fallback`, compatibility memory and recovery traces: Class B behavior-bearing playback policy;
- credential/settings backup `legacy` migration keys and v2 backup parsing: Class B persisted-data compatibility;
- Subtitle Octopus `legacy` worker/runtime: Class B required Chrome 53/webOS support;
- `debug-capture` and `debug-timing-probe`: Class B on-demand physical-TV diagnostics;
- Plex temporary subtitle decision session in `plex-client.js`: Class B active request lifecycle, despite the word `temporary`;
- CSS subtitle `shadow` settings and generic UI/network fallbacks: normal production semantics, not cleanup candidates;
- no surviving production symbol/file matching the retired J/K/L/M playback experiments or automatic shadow-HLS timing probe was identified by the current source scan.

## Static dead-function scan

A per-file named-function occurrence scan across non-vendor/non-locale production JavaScript found no named function declared exactly once in its source file. This is only a negative signal; it does not prove all remaining code reachable, but it means there is no additional trivial declaration-only dead-code family to remove without consumer analysis.

## Phase 5 decisions

- Split the 4619-line PlaybackController regression suite first; it has the clearest behavioral domains and the highest navigation cost.
- Do not split Player/Detail tests merely to reduce line counts unless the Playback split demonstrates a reusable pattern that preserves trace readability.
- `setup-server-session.js`, its isolated unit test, and the stale optional `serverSession` hook were removed after focused RED/GREEN verification.
- Retain useful physical-TV diagnostics and persisted legacy migrations.

## Playback test split result

The original 4619-line PlaybackController suite was split without production changes. The original ordered set of 149 named IIFE regression cases was captured before the split and compared byte-for-name/order with the three resulting suites; all 149 are present exactly once and in the original order:

- `tests/test-playback-controller-core.js`: ownership/startup/seek/terminal/Direct Play core behavior;
- `tests/test-playback-controller-subtitles.js`: local subtitle/runtime/editor integration and ASS/SRT ownership;
- `tests/test-playback-controller-recovery.js`: close/buffering/recovery/diagnostics/internal reopen behavior;
- `tests/helpers/playback-controller-harness.js`: fixture/timer/video construction plus raw observable arrays only.

All three suites pass independently and through `scripts/run-unit-tests.js`. Event sequences remain inline in the domain suites.

## Final dead-code sweep result

The runtime/startup/bundle reachability scan leaves only intentional non-startup JavaScript outside the coordinator bundle: `debug-capture.js`, `debug-timing-probe.js`, and lazy Subtitle Octopus runtime/worker assets. All are retained with active tests/documentation. No second Class A runtime file family was found.

The only proven orphan family was the old standalone setup server session. A source-contract RED proved `SetupController` still mentioned `serverSession`; removing the optional hook plus `app/setup-server-session.js` and `tests/test-setup-server-session.js` made SetupController, SetupFeatureController, TV-shell and baseline suites green. Current server discovery/account-server lifecycle remains owned by SetupFeatureController/server/account ports.

Keyword-based review of `legacy`, `fallback`, `probe`, `shadow`, `temporary` and compatibility paths found no additional safe deletion family. Persisted legacy backup/credential migrations, Direct Play recovery/compatibility memory, the Chrome 53 ASS worker and Web Inspector diagnostics are retained as Class B behavior/support code.


## Player feature test split result

The former 2590-line `tests/test-player-feature-controller.js` suite was split without production
changes. An automated name/order comparison against the pre-split Git version confirmed that all
87 named IIFE regression cases remain present exactly once and in the original order:

- `tests/test-player-feature-presentation.js`: presentation, wiring, controls and Up Next behavior;
- `tests/test-player-feature-queue.js`: playlist/container/adjacent/gap ownership;
- `tests/test-player-feature-settings.js`: subtitle editor, scoped preferences, quick controls and version selection;
- `tests/helpers/player-feature-controller-harness.js`: fixture/DOM/controller construction only.

All three suites pass independently and through the normal unit runner. The 1561-line Detail feature
suite was reviewed but not split: its behavioral boundaries are less clean and a split would duplicate
or obscure more harness/event context than it would remove navigation cost. It remains one suite by
deliberate evidence-based decision rather than line-count inertia.


## Final Phase 5 metrics and closure

Compared with behavior baseline `3389735` (which is identical in production source to cleanup-design
commit `4b412d0f`):

- non-generated/non-vendor/non-locale `app/**/*.js`: 156 files in both states, 51026 -> 51019 lines,
  2176172 -> 2177061 bytes. The small byte increase is accepted because ownership names/ports are more
  explicit; line count and runtime file count do not grow;
- generated `app/app.js`: 899972 -> 899927 raw bytes; current performance gate reports 177658 gzip bytes;
- `PlaybackController`: 2966 -> 2957 lines;
- `PlayerFeatureController`: 2850 -> 2841 lines;
- `DetailFeatureController`: 1872 -> 1812 lines;
- `ApplicationController`: 1769 -> 1765 lines while retaining explicit composition maps;
- `PlexClient`: 1833 -> 1333 lines; Home/pure mapping/URL/policy responsibilities moved to focused owners;
- JavaScript test files: 210 -> 214, while total test source decreases 45776 -> 45410 lines and
  2668978 -> 2651579 bytes because the Playback/Player monoliths were split around shared fixture-only harnesses;
- current startup/performance gate: 129/130 local scripts, 2208899/2210000 aggregate JS bytes;
- final memory gate: 0/200 weak payloads retained, 0/100 runtime payloads retained, +0.02 MiB net heap growth.

The final repository sweep found no additional evidence-backed Class A runtime family beyond the removed
setup server session. Remaining LG/webOS recovery, compatibility, persisted migration, Subtitle Octopus
legacy-worker and Web Inspector diagnostic paths are intentional Class B behavior/support code.

No cleanup implementation WIP remains. Open items in `TODO.md` are product backlog, including the deferred
physical-TV change where OK should activate visible Skip Intro/Skip Credits instead of opening player controls.

# Startup Player Code Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Player-only JavaScript parsing and Player composition out of the Home critical startup path while preserving eager local-ASS prewarm and every existing playback invariant.

**Architecture:** Keep a Core startup bundle and add one deferred `player.js` bundle with an explicit manifest. Core owns a small callback-based Player loader; Player-side composition owns `PlayerFeatureController` dependency wiring. `ApplicationController` retains application ports and a single `ensurePlayerReady` path, schedules background warm only after `first-focusable-ui`, and promotes loading immediately for an early playback request.

**Tech Stack:** ES5 JavaScript for LG webOS/Chrome 53, CommonJS-based Node tests, deterministic repository build scripts, static script injection, existing startup metrics.

**Spec:** `docs/cleanup/2026-09-06-startup-player-code-splitting-design.md`

## Implementation record (2026-09-06)

The standalone loader was committed as `ebd8fa7`. Tasks 1, 3, 4, and 5 plus the
release/freshness guards below are integrated as one runnable atomic activation,
as required by the reviewed sequence. The per-task commit commands below describe
logical ownership only; they were not executed as separate unbootable checkpoints.
The archive `HEAD` and `CHECKPOINT.json` identify the exact integrated commit.

The final implementation also preserves cold Library queue capture: shared Core
command/model policy retains one semantic activation before handing it to Player.
Partial Player/Playback construction and initial localization have local rollback.
The measured Core/deferred sizes and exact regression suites are in `../testing.md`.

## Executor latitude

This plan is an executable reference, not a requirement to preserve the current file layout. The executor may reorder files, move ownership, change private interfaces, consolidate or split modules, and revise task boundaries when doing so produces a cleaner architecture. Any material departure must keep the spec/documentation authoritative and must preserve or strengthen regression coverage.

The hard constraint is non-regression: existing LG/webOS, playback, Direct Play, seek/recovery, subtitle/ASS, queue/resume, focus/input, storage, and startup behavior must remain protected. In particular, local ASS prewarm stays early when enabled. Do not keep a worse abstraction merely because this plan named a specific file or function.

## Verified checkpoint sequencing (2026-09-06 review)

The user approved execution of this design and the preparatory maintenance review on
2026-09-06. The tasks below describe logical responsibilities, not permission to
commit a temporarily unbootable application.

1. Complete the documentation, Settings type-contract, and development-tooling
   checkpoints in `2026-09-06-maintenance-follow-through-plan.md` first.
2. Implement and test the standalone loader (Task 2) without activating it in Core.
   This checkpoint changes no startup behavior and avoids spending the unsplit
   bundle's remaining byte budget on an unused loader.
3. Implement Tasks 1, 3, 4, and 5 as one atomic activation checkpoint. Keep the eager
   script list and construction path until the deferred loader, composition,
   nullable lifecycle, retained first-Play intent, and post-Home warm are connected.
   Land the generated-artifact and release guards from Task 6 in this same checkpoint.
4. Complete Task 6's final documentation, verification, and archive checks. Physical
   LG responsiveness/ASS acceptance remains explicitly pending until measured on a TV.

Additional integration requirements:

- ESLint, type checking, feature-consumer inventory, and maintainability ownership
  checks must consistently distinguish authored source from generated `app/app.js`
  and `app/player.js`. Both artifacts still require ES5 parsing, deterministic
  freshness, budget reporting, and staged/release asset checks. Never weaken a
  source-owner rule to permit generated duplicates.
- Deferred Player construction must not call the startup-fatal `constructOwner()`
  failure path. A Player factory exception must clean its partial Player resources,
  retain/report the bounded Player failure, and leave the already-running Core/Home
  owners alive. Test constructor failure separately from script loading failure.
- Preserve reverse teardown for successfully registered owners, suppress late
  callbacks after destroy, and use current server/profile ports at construction.
- `tests/test-player-runtime-loader.js` and `tests/test-player-composition.js` are
  intentionally new suites; the three existing Player suites in Task 3 use their
  current presentation/queue/settings names.

## Global Constraints

- No Promise, dynamic `import()`, async/await, classes, optional chaining, or syntax unsupported by Chrome 53.
- Exactly two application runtime bundles for this iteration: Core and Player.
- `AssSubtitleRendererPool.prewarm()` remains in Core composition when `subtitleRenderingAss === true`.
- Worker/libass warmup must not depend on Player readiness.
- One authoritative Player manifest, one loader state machine, one Player composition function, and one `ensurePlayerReady` construction path.
- No generic service locator, feature-specific loaders, or duplicated dependency maps.
- Existing playback, seek, recovery, Direct Play, subtitle, queue, resume, and storage behavior remains unchanged.
- Background warm begins only after `first-focusable-ui`; an early playback request cancels the delayed warm and promotes the same load immediately.
- Existing full verify, memory, LG UX, ES5, architecture, asset, and baseline gates remain mandatory.

---

### Task 1: Deterministic Core / Player build split

**Files:**
- Modify: `scripts/build-app.js`
- Modify: `tests/test-app-bundle.js`
- Modify: `app/index.html`
- Modify: `scripts/build-production-runtime.js`
- Modify: `tests/test-production-runtime-bundle.js`
- Modify: `scripts/check-shell-assets.js` only if deferred-asset validation needs an explicit additional argument
- Generated: `app/app.js`
- Create/generated: `app/player.js`

**Interfaces:**
- Produces `Builder.CORE_MODULE_FILES`, `Builder.PLAYER_PRELUDE_FILES`, `Builder.PLAYER_MODULE_FILES` and deterministic `app/app.js` / `app/player.js` outputs.
- `player.js` is not a static script in `app/index.html`; it is a required deferred release asset.
- Production `core.js` must not absorb `player.js`.

- [x] **Step 1: Write RED bundle-manifest tests**

Add assertions that the Core manifest excludes Player-only coordinator modules and that a Player manifest owns them in deterministic order. Initial Player coordinator set:

```js
[
  'queue-gap-controller.js',
  'playback-queue-controller.js',
  'player-queue-controller.js',
  'player-controls-controller.js',
  'playback-controller.js',
  'player-subtitle-editor-controller.js',
  'player-feature-controller.js'
]
```

`player-composition.js` is appended to `PLAYER_MODULE_FILES` in Task 3 in the same commit that creates its real implementation; Task 1 must not add an empty scaffold.

Player prelude candidates must be explicitly listed and may only include modules with no Core production consumer. Shared modules such as `playback-strategy.js`, `version-selection.js`, `playback-queue-model.js`, `player-timeline-policy.js`, `ass-subtitle-renderer-pool.js`, `ass-subtitle-prefetch.js`, `subtitle-series-offset.js`, and settings/media helpers stay Core.

- [x] **Step 2: Run RED build tests**

Run:

```bash
node tests/test-app-bundle.js
node tests/test-production-runtime-bundle.js
```

Expected: failure because `PLAYER_*` manifests and `player.js` do not exist yet.

- [x] **Step 3: Implement two deterministic outputs**

Refactor `scripts/build-app.js` around explicit targets:

```js
var CORE_OUTPUT_FILE = 'app.js';
var PLAYER_OUTPUT_FILE = 'player.js';
var CORE_MODULE_FILES = [ /* current Core modules only */ ];
var PLAYER_PRELUDE_FILES = [ /* app-root Player-only modules */ ];
var PLAYER_MODULE_FILES = [ /* Player coordinator modules */ ];
```

Keep compaction/minification shared. `write(root)` writes both files; `check(root)` validates both. Export the manifests and target readers for tests.

- [x] **Step 4: Remove deferred Player-only standalone scripts from `index.html`**

Only remove a file after proving all production consumers are inside `player.js`. Keep early ASS bootstrap/prewarm dependencies and any shared Core dependency in the initial list.

- [x] **Step 5: Make production packaging preserve `player.js`**

`build-production-runtime.js` must treat `player.js` as a standalone deferred asset and leave it in the stage. The production index remains `startup-metrics.js`, `vendor/webOSTV.js`, `core.js`, `app.js`; `player.js` is loaded only by the runtime loader.

- [x] **Step 6: Verify GREEN build/package tests and regenerate artifacts**

Run:

```bash
npm run build:app
node tests/test-app-bundle.js
node tests/test-production-runtime-bundle.js
npm run check:assets
npm run check:performance
```

Expected: PASS, `app/player.js` present, initial source-script count/bytes lower than the pre-split baseline.

- [x] **Step 7: Commit**

```bash
git add scripts/build-app.js scripts/build-production-runtime.js scripts/check-shell-assets.js app/index.html app/app.js app/player.js tests/test-app-bundle.js tests/test-production-runtime-bundle.js
git commit -m "build: split deferred player runtime"
```

---

### Task 2: ES5 Player runtime loader

**Checkpoint status:** Standalone loader implemented and verified. Core inclusion is intentionally
reserved for the atomic activation checkpoint described above; startup is still eager here.

**Files:**
- Create: `app/player-runtime-loader.js`
- Modify: `scripts/build-app.js` to include the loader in Core prelude
- Create: `tests/test-player-runtime-loader.js`
- Generated: `app/app.js`

**Interfaces:**
- `PloffPlayerRuntimeLoader.create(options)` returns `{ ensure, reset, snapshot, destroy }`.
- `ensure(callback)` yields `(error, compositionModule)` exactly once per caller.
- `options.root` is the browser global, `options.document` creates `<script>`, `options.url` is `player.js?v=<same-cache-id>`, and `options.onLoadStart/onCodeReady` are optional metrics hooks.
- Loader states: `idle`, `loading`, `ready`, `failed`, `destroyed`.

- [x] **Step 1: Write RED loader tests**

Cover:

```js
loader.ensure(first);
loader.ensure(second); // one script node
script.onload();       // both callbacks once with root.PloffPlayerComposition
loader.ensure(third);  // immediate ready callback, no second script
loader.destroy();      // future ensure returns destroyed error; late callbacks ignored
```

Also cover missing `PloffPlayerComposition` on load, script error, preloaded composition global, and explicit `reset()` from failed -> idle.

- [x] **Step 2: Run RED loader tests**

```bash
node tests/test-player-runtime-loader.js
```

Expected: module missing / API missing.

- [x] **Step 3: Implement minimal state machine**

Use plain arrays/callbacks and one injected script element. Do not introduce Promise or a scheduler abstraction.

- [x] **Step 4: Run GREEN loader + ES5 tests**

```bash
node tests/test-player-runtime-loader.js
npm run build:app
npm run check:es5
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add app/player-runtime-loader.js scripts/build-app.js app/app.js tests/test-player-runtime-loader.js
git commit -m "feat: add deferred player runtime loader"
```

---

### Task 3: Move Player dependency composition to Player bundle

**Files:**
- Create: `app/coordinator/player-composition.js`
- Modify: `app/coordinator/application-controller.js`
- Modify: `tests/test-application-composition.js`
- Create: `tests/test-player-composition.js`
- Modify: `tests/test-tv-shell.js` source-contract assertions that currently expect Player wiring in ApplicationController
- Generated: `app/app.js`, `app/player.js`

**Interfaces:**
- `PloffPlayerComposition.create(root, ports)` creates and returns one `PlayerFeatureController`.
- `ports` contains application-owned objects/functions only: `platform`, `data`, `shell`, `detail`, `settings`, `state`, and the already-created ASS renderer/prefetch capabilities.
- The composition module itself reads Player implementation globals from `root` after `player.js` is loaded.
- `ApplicationController` no longer captures `root.PloffPlayerFeatureController`, `PlaybackController`, Player queue/controllers/views, or other Player-only globals at startup.

- [x] **Step 1: Write RED composition-owner tests**

Assert that `ApplicationController.create()` succeeds with Player-only globals absent and does not create Player. Assert `PlayerComposition.create()` receives ports and constructs `PlayerFeatureController` once with the expected module map.

- [x] **Step 2: Run RED tests**

```bash
node tests/test-player-composition.js
node tests/test-application-composition.js
```

Expected: failure because Player wiring is still eager/in ApplicationController.

- [x] **Step 3: Extract the existing PlayerFeatureController options map intact**

Move the implementation-module half of the map to `player-composition.js`; keep application state/feature callbacks as ports created by `ApplicationController`. Do not rename playback/subtitle semantics in this task.

- [x] **Step 4: Make ApplicationController nullable-Player safe during Core composition**

All snapshot/input/pointer delegates must either be unreachable outside Player view or null-safe before Player readiness. Preserve existing behavior after Player exists.

- [x] **Step 5: Run GREEN composition / Player regression tests**

```bash
node tests/test-player-composition.js
node tests/test-application-composition.js
node tests/test-player-feature-presentation.js
node tests/test-player-feature-queue.js
node tests/test-player-feature-settings.js
node tests/test-tv-shell.js
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add app/coordinator/player-composition.js app/coordinator/application-controller.js app/app.js app/player.js tests/test-player-composition.js tests/test-application-composition.js tests/test-tv-shell.js
git commit -m "refactor: move player composition behind bundle boundary"
```

---

### Task 4: Single `ensurePlayerReady` lifecycle and early-Play intent

**Files:**
- Modify: `app/coordinator/application-controller.js`
- Modify: `tests/test-application-composition.js`
- Modify: `tests/test-detail-extended-shell.js` if its source contract needs to target the readiness path instead of direct `playerFeature.openStandalone`
- Generated: `app/app.js`

**Interfaces:**
- `ensurePlayerReady()` is the only path that calls `playerRuntimeLoader.ensure()` and `PlayerComposition.create()`.
- `requestPlayback(request)` and `requestStandalonePlayback(request)` retain one playback intent while loading and execute it exactly once when ready.
- Repeated equivalent OK/Play requests during the same first-load window do not create multiple Player owners or duplicate opens.

- [x] **Step 1: Write RED race tests**

Characterize:

```js
requestPlayback();
requestPlayback();
// loader unresolved => one ensure, zero Player create/open
completePlayerLoad();
// one Player create, one open
```

Also test standalone playback, load error, destroy-before-load, and a server/profile change before completion using current ports at composition time.

- [x] **Step 2: Run RED application tests**

```bash
node tests/test-application-composition.js
```

Expected: fail because current transitions either access null Player or do not retain the request.

- [x] **Step 3: Implement `ensurePlayerReady` and one pending intent owner**

Use a small record such as `{ kind: 'detail'|'standalone'|'queue-key', request: value, context: scalars }`; clear it before invoking the Player open method to prevent reentrancy duplication.

- [x] **Step 4: Route all first-play entry points through the readiness owner**

Detail/Home standalone routes must not independently manipulate the loader.

- [x] **Step 5: Run GREEN composition + Detail/TV tests**

```bash
node tests/test-application-composition.js
node tests/test-detail-extended-shell.js
node tests/test-tv-shell.js
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add app/coordinator/application-controller.js app/app.js tests/test-application-composition.js tests/test-detail-extended-shell.js tests/test-tv-shell.js
git commit -m "feat: gate first playback on player readiness"
```

---

### Task 5: Post-Home warm scheduling, ASS priority, and startup metrics

**Files:**
- Modify: `app/coordinator/application-controller.js`
- Modify: `app/startup-metrics.js` only if milestone registry/limits require changes
- Modify: `tests/test-application-composition.js`
- Modify: `tests/test-startup-metrics.js`
- Modify: `tests/test-ass-subtitle-renderer-pool.js` only if an integration assertion is needed
- Generated: `app/app.js`

**Interfaces:**
- Named constant `PLAYER_WARM_DELAY_MS` controls one post-Home timer.
- Existing Home callback marks `first-home-content`, `first-focusable-ui`, then schedules one warm.
- `ensurePlayerReady` cancels the warm timer when promoted by user playback.
- Metrics hooks mark `player-load-start`, `player-code-ready`, `player-feature-ready` once.
- ASS `prewarm()` remains before `composition-ready` under the existing setting gate.

- [x] **Step 1: Write RED warm/ASS ordering tests**

Assert:

```text
ASS enabled: assPool.prewarm -> composition-ready -> first-focusable-ui -> player-load-start
ASS disabled: no assPool.prewarm
first-focusable-ui schedules exactly one warm
user Play before timer cancels timer and starts load immediately
```

- [x] **Step 2: Run RED tests**

```bash
node tests/test-application-composition.js
node tests/test-startup-metrics.js
```

Expected: fail for missing warm/Player milestones.

- [x] **Step 3: Implement bounded warm timer and metrics**

Use the repository's existing owned-timer lifecycle; do not add an idle scheduler. Player load errors during background warm are retained but do not replace Home view.

- [x] **Step 4: Run GREEN tests and measure source-startup delta**

```bash
npm run build:app
node tests/test-application-composition.js
node tests/test-startup-metrics.js
npm run check:performance
```

Record initial script count/bytes, Core bundle size, Player bundle size, and verify ASS ordering.

- [x] **Step 5: Commit**

```bash
git add app/coordinator/application-controller.js app/startup-metrics.js app/app.js tests/test-application-composition.js tests/test-startup-metrics.js
git commit -m "perf: warm player after home becomes interactive"
```

---

### Task 6: Release asset guards, docs, full verification, and LG checkpoint

**Files:**
- Modify: `scripts/check-performance-budget.js` to report deferred Player bytes separately if needed; do not hide startup regressions by increasing limits solely for the split.
- Modify: `scripts/check-shell-assets.js` or release checks to require `player.js` in staged/release output.
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`
- Modify: `CHANGELOG.md`
- Modify: `CHATGPT-HANDOFF.md`
- Modify: `docs/cleanup/2026-09-06-startup-player-code-splitting-plan.md` checkboxes

**Interfaces:**
- Release verification treats `player.js` as required deferred runtime asset.
- Documentation records Core/Player ownership and physical-LG acceptance metrics.

- [x] **Step 1: Add/adjust release-asset RED test if deferred bundle can currently be omitted silently**

Expected failure: staged/release output without `player.js` is rejected.

- [x] **Step 2: Implement asset guard and documentation**

Document that a smaller initial bundle is not acceptance evidence by itself; physical LG must confirm Home responsiveness and ASS warm timing.

- [x] **Step 3: Run complete fresh verification**

```bash
npm run verify
npm run test:memory
git diff --check
git fsck --no-dangling
```

Expected: all PASS, retained memory `0/200` and `0/100` as in current baseline.

- [x] **Step 4: Record final metrics**

Record:

```text
initial source script count/bytes before -> after
app.js raw/gzip before -> after
player.js raw/gzip
bootstrap -> first-focusable-ui (physical LG pending)
ASS warm milestones (physical LG pending)
player-load-start/code-ready/feature-ready (physical LG pending)
```

- [x] **Step 5: Commit final bookkeeping**

```bash
git add scripts app docs CHANGELOG.md CHATGPT-HANDOFF.md
git commit -m "docs: record deferred player startup architecture"
```

- [x] **Step 6: Produce complete checkpoint ZIP**

Archive the clean `develop` HEAD with `.git`, dependencies/reproduction resources following the established checkpoint procedure; re-extract and verify HEAD/branch/working tree before delivery.

## Physical LG acceptance (not completed by automation)

- [ ] Compare Home focusable timing and navigation during Player warm against `caebbe4`.
- [ ] Compare local ASS enabled/disabled cold-start and first-frame milestones.
- [ ] Exercise early Play, extras, playlist/collection remote and pointer paths, resume, Back, and the full existing playback matrix.
- [ ] Record measurements on the exact packaged commit before claiming the responsiveness objective or release signoff.

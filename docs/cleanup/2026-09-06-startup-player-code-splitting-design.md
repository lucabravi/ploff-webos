# Startup Player Code Splitting Design

## Status

Approved by the user on 2026-09-06 and integrated as one atomic activation after
the preparatory maintenance/loader checkpoints. The implementation plan records
execution and acceptance. Physical LG responsiveness acceptance remains pending.

## Goal

Make Ploff responsive as early as possible on LG webOS/Chrome 53 by removing Player parsing and composition from the critical Home startup path, while preserving the existing early local-ASS prewarm behavior and all playback/subtitle invariants.

The primary KPI is **time to a responsive, focusable Home**, not merely time to first paint.

## Non-goals

- No rewrite of the application architecture.
- No framework, module loader, Promise requirement, dynamic `import()`, `async`/`await`, or modern syntax unavailable on Chrome 53.
- No delay to the existing local ASS renderer/library prewarm when local ASS rendering is enabled.
- No change to playback, seek, recovery, Direct Play stickiness, subtitle timing, queue, resume, Skip Intro/Credits behavior, or storage semantics.
- No multi-chunk micro-bundling in this iteration.
- No third Advanced Subtitle Editor chunk unless measurements on the physical LG prove it is warranted later.

## Implementation latitude

The implementation is allowed to improve the internal architecture beyond the exact file split described below. The executor may reorder files, move responsibilities, change private interfaces, merge or split modules, or refactor adjacent startup/Player composition code when that produces a clearer ownership model. The filenames, manifest membership, and task boundaries in the implementation plan are therefore a recommended starting point, not a requirement to preserve the current layout.

This freedom is constrained by non-regression, not by structural conservatism:

- existing user-visible behavior, storage semantics, focus/input behavior, playback behavior, and webOS/Chrome 53 compatibility must remain unchanged unless the product requirement explicitly says otherwise;
- Direct Play stickiness, seek/recovery/keyframe settlement, queue/resume behavior, local subtitle timing, Advanced Subtitle Editor behavior, Skip Intro/Credits behavior, and all other accumulated LG regressions remain protected;
- local ASS prewarm remains an early-start priority when enabled and must not become dependent on deferred Player readiness;
- existing regression coverage may be reorganized but not weakened; source-contract tests may be rewritten to follow a better owner, but the behavior/invariant they protect must remain covered;
- performance budgets are guardrails, not architectural goals. They may be revised when a cleaner design has a justified cost, but startup responsiveness and Player/ASS readiness must be measured rather than assumed;
- if the cleanest implementation materially differs from this design, update the design/plan in the same commit so the repository remains authoritative.

The quality target is a simpler and more explicit architecture after the change, not merely a smaller initial bundle. If code splitting would require hidden coupling, duplicated dependency maps, fragile load-order tricks, or weaker tests, prefer redesigning the boundary over forcing the planned structure.

## Pre-split baseline (`caebbe4`)

Development startup currently loads 129 local scripts. Coordinator sources are then minified into `app/app.js`, which is approximately 900 KB. Production packaging additionally folds the startup scripts before `app.js` into `core.js`.

The coordinator bundle currently contains the complete Player stack, including `playback-controller.js`, `player-feature-controller.js`, queue/controllers, controls, subtitle-editor orchestration, and their composition. Player-specific coordinator source is a large fraction of the coordinator bundle. The wider Player/playback/subtitle dependency family is roughly 598 KB of unminified source.

`ApplicationController.create()` also reads Player globals and constructs `PlayerFeatureController` eagerly before `composition-ready` and before the first Home content/focus milestones.

Local ASS warmup is independent of Player creation:

- the ASS renderer pool is constructed by `ApplicationController`;
- when `subtitleRenderingAss === true`, `assRendererPool.prewarm()` runs during application composition;
- the worker-side glyph warm is scheduled from the existing Home-ready boundary.

That behavior must remain early and must not be moved into the deferred Player bundle.

## Approaches considered

### A. Defer Player construction but keep one bundle

Keep all JavaScript on the initial page, but construct `PlayerFeatureController` only after Home readiness.

**Advantages:** smallest code change and low lifecycle risk.

**Disadvantages:** does not remove parsing/compilation of Player JavaScript from startup, which is the dominant suspected cost on an older TV CPU. It optimizes only object construction and is therefore unlikely to produce the best Home responsiveness improvement.

**Decision:** rejected as insufficient.

### B. Core + Player bundle with explicit runtime loader

Split the runtime into a startup Core and one deferred Player bundle. Keep ASS bootstrap/prewarm dependencies in Core. Load and compose Player after the Home is focusable, or immediately if playback is requested before background warming finishes.

**Advantages:** removes both Player parsing and Player construction from the critical Home path while keeping a small number of coarse, understandable runtime units. The boundary follows an existing ownership boundary rather than arbitrary file sizes.

**Disadvantages:** introduces one asynchronous readiness boundary that must be explicit and rigorously tested.

**Decision:** selected.

### C. Multiple lazy chunks

Separate Player core, subtitle engine, subtitle editor, queue, diagnostics, etc.

**Advantages:** theoretically minimizes startup work.

**Disadvantages:** too many load states, more race/error paths, more difficult teardown, and more operational complexity on Chrome 53. It would make the code worse before measurements show the need.

**Decision:** rejected for this iteration.

## Architecture

### Runtime units

The runtime will have two application bundles:

1. **Core** — everything required to bootstrap, authenticate/select the server, render and navigate Home/library/detail/settings, handle input, start local ASS prewarm, and request playback.
2. **Player** — Player feature/controller composition and the Player-owned playback, queue, control, seek/recovery, chapter/skip-marker, subtitle playback/editor, and Up Next modules.

The boundary is ownership-based. A module stays in Core if Core needs it before Player readiness or if it is part of the early ASS prewarm path. A module moves to Player only when all production consumers are Player-owned.

### Player bundle manifest

The Player bundle must have an explicit ordered manifest in the build system. It must not be derived from directory scanning or naming conventions.

The manifest is the authoritative load order and is covered by tests. It includes Player-owned non-coordinator dependencies plus Player coordinator modules. `app/app.js` becomes the Core coordinator bundle and no longer contains Player coordinator sources.

The exact manifest will be locked during implementation from the dependency graph and verified by browser-contract tests. A module with a Core consumer cannot be moved simply to reduce bytes.

### Player composition owner

Player dependency composition moves out of `ApplicationController` into a dedicated Player-side composition module loaded with the Player bundle.

That module has one responsibility: create `PlayerFeatureController` from the already-established application ports and the Player modules present on `root` after the bundle loads.

`ApplicationController` remains the owner of application state and cross-feature ports. It no longer captures the entire Player module family during Core construction.

This improves the composition root: the Core root describes Player-facing ports, while the Player-side composition describes Player implementation modules.

### Core runtime loader

A small ES5-compatible Core module owns Player code readiness. It uses an explicit state machine:

- `idle`
- `loading`
- `ready`
- `failed`
- `destroyed`

It exposes callback-based operations only; there is no Promise/polyfill dependency.

Required semantics:

- concurrent `ensure()` calls share one script load;
- callbacks are delivered exactly once;
- already-ready calls complete without another script element;
- a load error is retained and reported deterministically;
- destroy prevents late callbacks from constructing Player state;
- if the Player composition global already exists (tests or preloaded development scenarios), no script is injected;
- successful code readiness and successful Player feature construction are separate milestones.

### Player feature lifecycle

`playerFeature` remains nullable in `ApplicationController` until Player is composed.

A single private `ensurePlayerReady()` path owns construction; only the loader
needs a callback interface. All early playback entry points route through it. There must not be separate loading logic for Home play, Detail play, standalone play, resume, or queue navigation.

If playback is requested before warm-load completes:

1. the request is retained as application intent;
2. any pending delayed warm timer is cancelled;
3. Player load is promoted immediately;
4. Player is composed once;
5. the retained request is executed exactly once.

The user must never need to press Play twice.

Once Player is ready, existing synchronous Player paths remain synchronous behind the ready object; the asynchronous boundary is only the first readiness transition.

### Background warm scheduling

Background Player warm begins only after the existing first focusable Home boundary. It must not be scheduled from bootstrap or before Home input is available.

The initial implementation uses one explicit bounded delay after `first-focusable-ui`. The delay is a named constant and can be tuned from physical-TV measurements; it is not a generic task scheduler.

A user playback request always has priority over the timer and starts loading immediately.

We will not add an input-idle scheduler in this iteration. If physical LG measurements show that parsing the Player bundle after Home causes visible navigation stalls, that is evidence for a follow-up design rather than justification for speculative scheduling complexity now.

### Local ASS prewarm

Local ASS is a hard exception to Player deferral.

When `subtitleRenderingAss === true`:

- `AssSubtitleRendererPool` stays in Core;
- its current early `prewarm()` remains in application composition;
- the ASS worker/library bootstrap modules required by that prewarm remain available before Player load;
- the current worker-side glyph warm scheduled from Home readiness remains independent of Player code readiness;
- Player warm must not gate, cancel, restart, or replace the ASS worker;
- Player must adopt/reuse the already-warmed ASS renderer exactly as today.

When local ASS is disabled, the current rule remains: no startup ASS worker/prewarm is created.

Advanced Subtitle Editor UI/orchestration stays in the Player bundle for the first split. It does not control the early ASS prewarm lifecycle.

## Build and packaging

### Development/runtime build

The build system produces two generated application artifacts with explicit manifests:

- Core application bundle (existing `app.js` name may be retained if doing so minimizes package churn);
- `player.js` deferred bundle.

Player-owned standalone scripts are removed from the initial `index.html` load list once they are included in `player.js`.

### Production package

`build-production-runtime.js` continues to produce the startup `core.js`, but `player.js` is a standalone packaged runtime asset and is not folded into `core.js`.

The production index therefore loads only the startup Core path. The Player loader injects `player.js` when required.

Packaging/asset checks must explicitly verify that `player.js` is present in release output even though it is not a static `<script>` in `index.html`.

### Cache/version behavior

The Player URL uses the same release/cache identity as other application assets. Development may continue to use the repository's `?v=dev` convention. The implementation must not introduce a separate version source.

## Responsiveness and metrics

Existing startup milestones remain authoritative:

- `bootstrap`
- `composition-ready`
- `server-ready`
- `first-home-content`
- `first-focusable-ui`

Add bounded numeric milestones for:

- `player-load-start`
- `player-code-ready`
- `player-feature-ready`

ASS cold-start metrics remain unchanged and continue to report worker/libass/warm/real-track milestones.

The physical LG acceptance comparison is:

1. `bootstrap -> first-focusable-ui` must improve or at minimum not regress measurably;
2. remote navigation immediately after Home appears must remain smooth;
3. with local ASS enabled, existing ASS prewarm milestones must not regress materially;
4. a playback request issued before Player warm completes must execute once and without a second OK press;
5. once Player is warm, playback opening must remain behaviorally equivalent to the current build.

The first implementation is successful only if the physical LG confirms the responsiveness objective. A smaller initial bundle alone is not sufficient evidence.

## Error handling

Background Player-load failure must not break Home. The failure is retained by the runtime loader and may be surfaced in diagnostics.

If the user requests playback after or during a failed Player load, the existing presentation layer shows a bounded application error rather than silently swallowing the request or leaving the UI in a pending state.

Retry policy is intentionally conservative: one explicit later `ensure()` may retry only if the loader has been reset through a defined recovery operation. There is no uncontrolled automatic retry loop.

Player construction failure is distinct from initial application construction failure.
A deferred Player factory must roll back only its own partial resources; it must not
reuse the startup-fatal application rollback that destroys all Core/Home owners.
A retained construction error is reported through the same bounded first-Play error
surface without changing the working Home view during background warm.

Destroy/unload cancels pending warm timers, suppresses late loader callbacks, and destroys Player if it was constructed.

## Input and race invariants

- Core input handling must work before Player is ready.
- Player-only controls/overlays run only after composition. The existing queue
  capture also owns Library/Detail entry; before readiness its Library activation
  is classified with the shared Core command/model policy and retained as a semantic
  intent through the same readiness path. Core does not acquire queue ownership.
- snapshot paths must tolerate `playerFeature === null` outside Player view.
- a Play request racing background warm shares the same load and creates one Player feature.
- repeated OK/Play presses during first load must not create multiple Players or duplicate playback opens.
- server/profile changes before Player readiness must use current application ports at construction time; the Player composition must not capture stale server state in the loader.

## Testing strategy

Implementation is test-first.

### Build tests

- Core coordinator manifest excludes Player coordinator modules.
- Player manifest contains required Player modules in deterministic dependency order.
- `player.js` is current and reproducible.
- production packaging leaves `player.js` as a standalone asset and does not fold it into startup `core.js`.
- release asset checks fail if the deferred bundle is missing.

### Runtime loader tests

- idle -> loading -> ready;
- concurrent ensure coalescing;
- preloaded composition path;
- load failure;
- no callback after destroy;
- no duplicate script injection;
- explicit reset/retry semantics if reset is retained.

### Application composition tests

- Player is not constructed during initial application composition;
- ASS prewarm still starts during composition when enabled;
- disabled ASS still creates no startup worker/prewarm;
- first Home readiness schedules exactly one Player warm;
- early Play promotes load immediately and preserves the request;
- warm/Play race constructs one Player and opens once;
- destroy before readiness leaves no Player owner;
- normal post-ready paths preserve current behavior.

### Regression gates

All existing Player, Playback, subtitle, queue, LG UX, ES5, performance, memory, and baseline tests remain mandatory. No existing physical-TV workaround is removed as part of code splitting.

## Maintainability requirements

This work is accepted only if the resulting code is easier to reason about than the current eager composition.

Specifically:

- one authoritative Player manifest;
- one authoritative Player loader state machine;
- one authoritative Player composition function;
- one `ensurePlayerReady` construction path;
- no generic service locator;
- no duplicated dependency maps between Core and Player;
- no Promise/polyfill or modern-language compatibility burden;
- no feature-specific loading branches;
- no arbitrary micro-chunks;
- no production behavior changes bundled with the startup optimization.

If implementation requires violating these constraints, the split should be abandoned rather than forcing it through.

## Rollout

1. Establish bundle/metric baseline from the handed-off `caebbe4` checkpoint (the earlier design used `20e9ee8`).
2. Add build separation and loader tests without changing runtime behavior.
3. Move Player composition behind the readiness owner.
4. Enable post-Home warm scheduling while preserving eager ASS prewarm.
5. Run full repository verification and memory gates.
6. Produce a checkpoint for physical LG validation.
7. Compare startup/ASS/Player metrics and subjective remote responsiveness.
8. Only after physical validation decide whether any further chunking is justified.

## Acceptance summary

The design is acceptable only if it simultaneously achieves:

- earlier or equal Home interactivity on physical LG;
- no regression to local ASS warm readiness;
- no first-Play lost input or duplicate input;
- no playback/subtitle behavioral regression;
- cleaner composition ownership than the current eager Player wiring;
- bounded two-bundle architecture rather than a general-purpose lazy-loading framework.

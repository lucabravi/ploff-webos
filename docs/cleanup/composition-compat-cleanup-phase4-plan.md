# Composition and Compatibility Cleanup Phase 4 Implementation Plan

> **For agentic workers:** execute inline task-by-task with characterization-first TDD and a commit after each independently reviewable change.

**Goal:** Remove proven-dead compatibility surface and stale composition glue without hiding dependency ownership or changing Plex protocol behavior.

**Architecture:** `ApplicationController` remains the explicit composition root and `PlexFeaturePorts` remains the reviewed production capability selector. Phase 4 narrows only compatibility/public surfaces whose production consumers are proven absent, while preserving internal Plex helpers still used by transport/parsing flows and retaining test-only access only when it protects a meaningful compatibility contract.

**Spec:** `docs/cleanup/codebase-cleanup-design.md`

## Global constraints

- Stay on `develop`; no push/tag.
- Preserve all Plex request URLs, methods, parsing, stream-selection, watched/progress, metadata-refresh, settings-backup, playback, search, library and Detail behavior used by production feature ports.
- Do not replace `ApplicationController` dependency maps with a service locator, builder, generic context or dynamic router.
- Remove an export/function only after checking production consumers, feature contracts, direct tests, documentation and practical compatibility value.
- Keep bundle/startup cost measured. Budget increases are allowed when the reviewed ownership improvement justifies them; never raise a limit merely to silence an unrelated regression.
- TDD for every reviewed contract narrowing; full `npm run verify` and `npm run test:memory` at phase checkpoint.

---

### Task 1: Inventory composition and compatibility ownership

- [x] Record Phase 4 baseline metrics for `application-controller.js`, `plex-client.js`, `plex-feature-ports.js`, and generated bundle.
- [x] Map every `PlexFeaturePorts` method to production consumers.
- [x] Classify `PlexClient` exports as production-consumed, internal-but-test-visible, or proven obsolete.
- [x] Audit root composition callbacks/dependencies for dead or duplicate wiring.
- [x] Record retained compatibility rationale and proven-dead candidates.
- [x] Commit inventory.

### Task 2: Remove obsolete metadata hierarchy compatibility sequence

**Files:**
- Modify: `app/plex-client.js`
- Modify: `tests/test-plex-client.js`
- Preserve: `tests/test-tv-shell.js`
- Regenerate: `app/app.js`

**Contract:**
- `PlexClient.refreshMetadataSequence` is absent from the reviewed public surface.
- `refreshMetadata(config, ratingKey, callback)` remains the single-item Plex metadata refresh primitive used by current flows.
- Detail continues to own explicit episode/season/show sequencing instead of delegating to an opaque PlexClient sequence helper.

- [x] Add a reviewed-surface assertion that `refreshMetadataSequence` is absent and remove it from the expected public key list.
- [x] Run `node tests/test-plex-client.js` and verify RED because the obsolete export is still present.
- [x] Remove the obsolete sequence function/export and its historical direct behavior test; retain the TV-shell assertion that Detail does not reintroduce it.
- [x] Rebuild the bundle and run PlexClient/TV-shell/Detail suites.
- [x] Commit.

### Task 3: Prune additional proven-unused compatibility exports

- [x] Re-run the production-consumer/export matrix after Task 2.
- [x] For each remaining test-visible-only export, determine whether the test protects an intentional reviewed facade or can test behavior through the owning production interface/module instead.
- [x] Remove only exports whose compatibility value is disproved; keep internal helper functions when still used by PlexClient.
- [x] For each removed export, perform RED/GREEN contract narrowing and update direct tests to the nearest semantic production owner rather than deleting coverage.
- [x] Measure bundle impact and commit each coherent export family separately.

#### Task 3 checkpoint - Plex Home/facade ownership

A coherent Task 3 checkpoint is complete: Home/recommendation shaping has a dedicated `PlexHomeModel`
owner, justified even though it adds one development startup script; helper-only activity/account/navigation
exports are covered through production APIs. Exact startup-script count is not frozen, but the configured
fan-out/aggregate-byte guardrails remain mandatory. The remaining export matrix is intentionally still open.

### Task 4: Audit explicit application composition

- [x] Map one-consumer callbacks/adapters in `ApplicationController` and identify pure duplicate wiring only.
- [x] Keep large explicit option maps when they make ownership readable.
- [x] Remove only dead callbacks, stale aliases, duplicate teardown/registration or dependencies with zero production consumers.
- [x] Characterize source/lifecycle contracts before each removal and keep composition behavior unchanged.
- [x] Commit only evidence-backed changes.

### Task 5: Phase 4 verification and documentation

- [x] Run `npm run verify`.
- [x] Run `npm run test:memory`.
- [x] Run `git diff --check`, performance budget checks and `git fsck --no-dangling`.
- [x] Record before/after Plex/composition/bundle metrics and retained compatibility rationale.
- [x] Update `CHANGELOG.md` and the Phase 4 inventory.
- [x] Commit Phase 4 checkpoint documentation.

### Phase 4 closure

The remaining `PlexClient` facade was reviewed export-by-export. Thirty-five of the thirty-six retained exports have production consumers. `loadRecommendedItems` is the sole intentionally test-visible exception because its direct tests protect recommendation cache/LRU, concurrency, retry and race behavior that would become less precise if forced through the broader `loadHome()` orchestration. `ApplicationController` retains explicit composition maps; the only composition ownership gap found was settings backup, which now receives a reviewed four-method `settingsBackup` Plex feature port.

Runtime-size policy was also clarified during this phase: byte/script budgets remain measured engineering guardrails, but cleanup may raise them when a reviewed ownership boundary or reduced coupling justifies the cost. A limit must never be raised merely to silence an unrelated regression.

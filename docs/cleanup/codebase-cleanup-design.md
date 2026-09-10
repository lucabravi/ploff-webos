# Ploff webOS v1.0.7 - Evidence-Based Deep Cleanup Design

Status: approved direction, implementation pending
Date: 2026-09-06
Baseline commit: `33897353594eccb23fbce95dede2da2fd8f66d88`
Branch: `develop`

## Context

Ploff v1.0.7 has reached a stable point where all currently known playback and local-subtitle defects reproduced on the target LG/webOS environment have been addressed. The codebase has also already completed an important modularization/hardening pass: native video mutation, seek/decoder settlement, playback lifecycle, timeline/reporting, subtitle runtime, queue presentation, Plex feature ports, and other domains have explicit owners.

The next goal is therefore not a rewrite. It is a deep cleanup of the existing architecture while preserving the behavior and hardware knowledge accumulated through the v1.0.7 work.

The approved direction is **deep cleanup plus aggressive legacy removal, but only when removal is supported by evidence**. Historical code is not retained merely because it is old, but webOS/LG workarounds are not deleted merely because they look unusual.

## Baseline

At `3389735`:

- `app/coordinator/playback-controller.js`: 2966 lines, approximately 144.7 KB;
- `app/coordinator/player-feature-controller.js`: 2850 lines, approximately 137.3 KB;
- `app/coordinator/detail-feature-controller.js`: 1872 lines, approximately 89.5 KB;
- `app/coordinator/application-controller.js`: 1769 lines, approximately 101.0 KB;
- generated `app/app.js`: 899,972 / 900,000 raw bytes and 177,769 / 190,000 gzip bytes;
- startup JavaScript assets: 128 / 130 local scripts and 2,206,635 / 2,210,000 bytes;
- `npm run check:maintainability` passes;
- current ownership rules in `AGENTS.md`, `docs/maintenance.md`, `docs/application-source-architecture.md`, `docs/runtime-architecture-redesign.md`, and `docs/playback-invariants.md` are authoritative constraints rather than cleanup targets.

The generated bundle was effectively saturated at the cleanup baseline. Runtime size remains an important engineering signal, but architectural cleanup is allowed to increase bundle/startup budgets when a cohesive ownership boundary, reduced coupling, or clearer responsibility justifies the cost. Budget changes must be explicit and measured rather than used to hide accidental growth.

## Goals

1. Reduce accidental complexity, duplicate policy, obsolete branches, stale state, and unreachable compatibility code.
2. Finish the ownership model already established by the runtime architecture redesign rather than introducing a second architecture beside it.
3. Make the remaining LG/webOS workarounds explicit and understandable so they no longer look like unexplained legacy code.
4. Reduce the cognitive load of the largest controllers where a cohesive ownership boundary actually exists.
5. Split oversized tests by behavioral domain without weakening the regression cases derived from physical-TV defects.
6. Keep generated runtime size and startup asset pressure measured and intentional; modest growth is acceptable when it buys a demonstrably better ownership boundary or removes harmful coupling.
7. Preserve all user-visible behavior, persistence, Plex protocol behavior, diagnostics privacy, ES5/Chrome 53 compatibility, and current feature contracts unless a consumer audit proves that a contract member is dead.

## Non-goals

- No UI redesign or new feature work.
- No framework, transpiler, runtime dependency, event bus, service locator, shared mutable context, or generic DI container.
- No rewrite of PlaybackController or PlayerFeatureController from scratch.
- No speculative abstraction whose only benefit is fewer lines in a large file.
- No removal of a hardware workaround without a regression test or other concrete evidence that its protected scenario is covered elsewhere.
- No push or release tag as part of the cleanup.

## Governing principle: delete legacy by evidence

Every legacy-looking path is classified before removal.

### Class A - proven dead: remove

A path may be deleted when all applicable evidence agrees:

- no production call site or dynamically resolved reference;
- no feature/public contract requires it;
- no persisted schema or compatibility surface depends on it;
- no current documentation names it as an invariant or supported diagnostic;
- mutation/removal does not invalidate a focused regression test for a real LG/webOS scenario;
- Git history shows it was an experiment, superseded implementation, or compatibility layer for an architecture that no longer exists.

Examples include retired experimental timing paths, abandoned shadow-probe logic, write-only state, duplicated helper implementations, unreachable fallback branches, and unconsumed compatibility exports.

### Class B - awkward but behavior-bearing: keep and clarify

Code remains when it protects a demonstrated platform behavior such as:

- keyframe/decoder settlement;
- unusual ordering of `seeked`, `playing`, `waiting`, `stalled`, `timeupdate`, and `readyState` on LG webOS;
- stale callback rejection;
- Direct Play sticky recovery and classified fallback;
- local subtitle discontinuity and provisional-frame suppression;
- Chrome 53 / ES5 limitations;
- Subtitle Octopus Legacy53 worker/runtime behavior.

Such code should be renamed, moved to its proper owner where possible, and documented with the invariant it protects. The goal is to remove mystery, not protection.

### Class C - uncertain: characterize before deciding

If reachability or platform purpose is ambiguous, first add or identify characterization coverage and trace the production consumers. The cleanup does not delete uncertain code based on intuition alone.

## Architectural direction

### 1. Playback: complete existing ownership, do not create another playback framework

`PlaybackController` remains the reviewed public orchestration facade. The cleanup audits its remaining private state and policy against the already-established owners:

- physical media commands -> `NativeVideoDriver`;
- seek decisions and decoder settlement -> `PlaybackReposition`;
- lifecycle/transient state -> `PlaybackSession`;
- clock/reporting/keepalive -> `PlaybackTimeline`;
- active local subtitles and renderer presentation -> `SubtitleRuntime`;
- fallback-plan progression -> `PlaybackRecovery`.

Residual booleans, counters, timers, and duplicated decisions in `PlaybackController` move only when one of those owners is clearly authoritative. The recent provisional-subtitle seek gate is a concrete example of state that must be reviewed as lifecycle/presentation state rather than allowed to become another facade boolean cluster.

Cross-owner use cases remain in `PlaybackController`. A new owner is introduced only if the audit demonstrates a cohesive responsibility with independent state/lifecycle and a small semantic interface. File-size reduction alone is not sufficient justification.

The public `PlaybackController` API remains stable unless a repository-wide consumer audit proves a method unused and the controller-contract test is intentionally updated.

### 2. Player: remove duplication first, extract only cohesive lifecycle owners

`PlayerFeatureController` remains the Player screen orchestrator. Existing extracted owners (`PlayerControlsController`, `PlayerQueueController`, `PlayerSubtitleEditorController`, queue-domain modules, Playback) remain authoritative.

The cleanup will:

- identify duplicate panel/open-close/focus/timer policy;
- identify state that belongs to an already-existing owner;
- collapse repeated callback wrappers that add no semantic translation;
- remove obsolete Player paths proven unused;
- extract a new private module only when a remaining responsibility has a clear lifecycle and can be understood/tested independently.

The previous architecture audit concluded that some remaining Player responsibilities are genuinely cross-owner orchestration. This cleanup may revisit that conclusion with current evidence, but it must not split those flows merely to make the source file shorter.

### 3. Detail: separate deterministic episode/media presentation from feature lifecycle

`DetailFeatureController` is audited for deterministic transformations and DOM/presentation policy that can move to focused views/helpers without moving request, focus, or feature lifecycle ownership.

Particular attention goes to episode-strip state, progress/watched presentation, action availability, metadata shaping, and repeated media-row construction. The recently corrected rewatch progress behavior becomes a regression invariant during any extraction.

`DetailController` and existing shared media/context modules remain the preferred owners for domain state already represented there.

### 4. Application composition: simplify honestly, not cosmetically

`ApplicationController` is intentionally the explicit composition root. Large visible option maps are not considered duplication merely because they occupy many lines.

Cleanup is limited to:

- dead callbacks or dependencies;
- duplicated wiring with identical semantics;
- obsolete compatibility aliases;
- ownership registration or teardown duplication that current lifecycle helpers already supersede.

No generic context object, dynamic router, service locator, or builder abstraction may hide dependency ownership just to reduce line count.

### 5. Plex and compatibility surfaces: consumer-driven pruning

`PlexFeaturePorts`, `PloffClient`, media mappers, and compatibility helpers are re-audited after feature cleanup. Public or compatibility exports are removed only after checking production consumers, feature contracts, tests, documentation, and practical compatibility value.

Transport, XML/media parsing, and feature lifecycle responsibilities remain separate.

### 6. Tests: split by behavior, preserve real-world traces

Large test files may be divided into domain-focused suites, for example playback startup, seek/settlement, recovery, buffering, subtitle runtime/editor integration, terminal behavior, and diagnostics. Shared harness extraction is allowed only when it does not hide the event sequence being tested.

Regression tests derived from actual LG behavior are preserved even if the implementation that originally motivated them moves or disappears. Golden traces may change only when the cleanup intentionally removes an implementation artifact while preserving the user-visible invariant; that change must be documented in the same commit.

## Cleanup phases

### Phase 0 - Baseline and inventory

- Record current bundle/startup budgets and largest-source metrics.
- Inventory mutable state, private helpers, call sites, exports, timers, listeners, and recovery/diagnostic branches in the four largest controllers.
- Classify deletion candidates as proven-dead, behavior-bearing, or uncertain.
- Do not change production behavior in this phase.

### Phase 1 - Playback residual-state and dead-path cleanup

- Characterize current Playback traces before each structural change.
- Move residual state/policy into existing owners where ownership is unambiguous.
- Remove superseded recovery/timing/experimental branches proven unreachable.
- Keep all Direct Play sticky, decoder-settlement, startup-seek, subtitle-discontinuity, and provisional-subtitle invariants intact.
- Re-audit `PlaybackController` public/private surface after each extraction.

### Phase 2 - Player orchestration cleanup

- Remove dead wrappers and duplicated panel/timer/focus policy.
- Return misplaced state to existing Player owners.
- Extract only demonstrated cohesive private responsibilities.
- Preserve Back/focus/remote/pointer semantics and all queue/subtitle-editor transitions.

### Phase 3 - Detail and presentation cleanup

- Extract deterministic rendering/shaping logic from `DetailFeatureController` where appropriate.
- Deduplicate media/episode presentation helpers.
- Preserve watched-state and partial-rewatch progress semantics.
- Keep request/focus/lifecycle ownership in the feature controller.

### Phase 4 - Composition and compatibility pruning

- Audit root wiring for dead dependencies and stale aliases.
- Audit Plex feature ports and compatibility exports after consumer cleanup.
- Remove only proven-unused contract surface.
- Keep explicit dependency maps readable in the composition root.

### Phase 5 - Test architecture, documentation, and final dead-code sweep

- Split oversized test files by domain where this improves locality without weakening traces.
- Update architecture/maintenance documentation to describe final ownership rather than historical migration steps.
- Run a final repository-wide dead-code and duplicate-policy audit.
- Remove temporary diagnostics only when they are redundant with retained support diagnostics; keep the useful recovery/subtitle observability that has proven valuable on physical TV.

## Commit and checkpoint strategy

Implementation uses small commits on the existing `develop` branch. A commit should represent one ownership move, one dead-code family, or one test-architecture change; unrelated cleanup is not bundled together.

At the end of each phase:

1. working tree must be clean after commit;
2. `npm run verify` must pass;
3. `npm run test:memory` must pass for lifecycle-affecting phases and at every phase checkpoint;
4. `git diff --check` and Git integrity checks must pass;
5. generated `app/app.js` must be fresh;
6. bundle/startup budgets are recorded and must not be increased merely to accommodate refactoring;
7. a recoverable ZIP checkpoint with `.git` may be produced when handing work between sessions.

No push or tag is created.

## Testing strategy

Refactoring follows characterization-first TDD:

1. identify the observable contract of the code being moved/deleted;
2. add or confirm a focused test that fails under an intentionally broken/mutated version of that contract when practical;
3. perform the smallest structural change;
4. run focused tests;
5. rebuild generated artifacts;
6. run broader owner/consumer tests;
7. run full verification at phase checkpoints.

Playback changes additionally preserve the physical-TV matrix in `docs/testing.md`. A final physical LG pass remains required before release signoff even when automated behavior is unchanged.

## Performance and size policy

The cleanup must keep delivered-runtime cost visible, but source modularity and correct ownership take priority over preserving an historical byte count.

Baseline:

- `app/app.js`: 899,972 raw / 177,769 gzip bytes;
- startup local scripts: 128 at the original baseline (historical measurement, not a frozen count);
- startup JavaScript bytes: 2,206,635.

Rules:

- performance-budget limits are engineering guardrails, not frozen cleanup targets; they may be raised deliberately when a reviewed architectural improvement justifies the runtime cost;
- every budget increase must record the before/after measurements and the ownership/coupling benefit it buys;
- reduction in raw/gzip size remains desirable, but is secondary to eliminating misplaced policy, duplicated state, and unnecessary compatibility surface;
- new UMD modules must earn their wrapper/runtime/startup cost through a clear ownership boundary; exact script count may increase deliberately while the configured fan-out and aggregate-byte guardrails remain green;
- source-only test/documentation changes do not justify shipping more JavaScript.

## Documentation policy

Current architecture documents are updated to describe the final steady state. Completed migration/checklist material is not left as permanent duplicate authority; Git history remains the archive for historical implementation detail, following the repository's existing documentation policy.

Hardware workarounds that remain must be documented next to the owning invariant, including the platform behavior they protect. Comments should explain *why the odd behavior is necessary*, not restate code mechanics.

## Success criteria

The cleanup is complete when all of the following hold:

- all automated gates and memory checks pass;
- no known LG/webOS regression has been introduced;
- current playback and subtitle invariants remain explicitly covered;
- proven-dead experimental/compatibility code has been removed;
- remaining unusual platform code has a clear owner and documented reason;
- major controllers contain less misplaced policy/state even if an honest composition/orchestration file remains large;
- controller and feature public contracts are no wider than current production consumers require;
- oversized tests are easier to navigate without losing event-order detail;
- generated runtime size and startup fan-out remain measured, documented, and within the current reviewed guardrails; any guardrail increase has an explicit architectural rationale;
- no new runtime dependencies or unsupported JavaScript syntax are introduced;
- documentation reflects the final architecture and contains no competing ownership model.

## Explicit rejection criteria

A proposed cleanup change is rejected if it:

- needs a new global/shared context to reduce parameter lists;
- moves behavior into a generic helper with no clear domain owner;
- deletes a webOS workaround without a replacement invariant/test;
- changes seek/recovery/subtitle behavior merely because a simpler implementation looks cleaner;
- hides the application dependency graph behind dynamic construction;
- widens performance or maintainability budgets only to silence a gate, without a corresponding architectural or correctness benefit;
- requires a rewrite-sized diff that cannot be verified in isolation.

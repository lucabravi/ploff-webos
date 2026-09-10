# Maintenance Follow-through Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task. The user approved this sequence on 2026-09-06; do not stop between completed checkpoints to request approval again.

**Goal:** Improve documentation, declared contracts, and development feedback before activating deferred Player startup without changing playback or persistence semantics.

**Architecture:** Preserve existing feature ownership. Keep shared AST mechanics development-only, SettingsSchema authoritative, and the deferred Player boundary specific rather than introducing a generic loader or service locator.

**Tech Stack:** Existing Node.js development tools, TypeScript declaration checks, dependency-free ES5 runtime, and the repository's test and memory gates.

**Spec:** The approved maintenance review and `2026-09-06-startup-player-code-splitting-design.md`.

## Global constraints

- Stay on `develop`; no pushes, tags, version changes, or worktrees.
- Add regression tests before behavioral changes; observe RED before implementation.
- Each completed task must pass fresh `npm run verify`, `npm run test:memory`, and `git diff --check` before commit and checkpoint ZIP.
- Include the project, `.git`, generated artifacts, and offline dependencies in each ZIP; re-extract and verify the branch, HEAD, and clean tree.
- Physical LG performance/playback signoff is not implied by automated verification.

## Task 1: Documentation and executable handoff

**Files:** `docs/README.md`, `CHATGPT-HANDOFF.md`, `docs/architecture.md`, `docs/application-source-architecture.md`, and the active startup design/plan.

- [x] Correct Task 3's existing Player test commands to presentation/queue/settings.
- [x] Distinguish active plans from implemented architecture and historical phase records.
- [x] Record the atomic activation sequence, generated-artifact exclusions, and nonfatal deferred-construction boundary.
- [x] Validate local document links and that existing-suite commands reference real files; run the checkpoint gates and commit `docs: reconcile maintenance and player startup handoff`.

## Task 2: Settings declaration parity

**Files:** `types/runtime-contracts.d.ts`, new `tests/test-settings-type-contract.js`, `docs/settings.md`.

**Contract:** Every schema key appears exactly once as a required, correctly typed `PloffSettingsRecord` property; `version` is the only extra metadata key.

- [x] Write a compiler-backed test comparing the interface to `SettingsSchema.all()` and checking normalized values against the declaration; run `node tests/test-settings-type-contract.js` and observe the five missing properties.
- [x] Add `subtitleRenderingSrt` and `subtitleRenderingAss` as booleans, `uiTextScale` and `subtitleSize` as numbers, and `artworkDataSaver` as boolean. Do not change the schema, defaults, storage keys, or migrations.
- [x] Run `node tests/test-settings-type-contract.js`, `node tests/test-settings-schema-integration.js`, and `npm run typecheck:contracts`; run checkpoint gates and commit `fix: keep settings declarations aligned with schema`.

## Task 3: Architecture-checking mechanics

**Files:** `scripts/check-coordinator-architecture.js`, `scripts/check-maintainability.js`, `scripts/check-feature-contracts.js`, new `scripts/lib/es5-ast.js`, and focused checker tests.

**Contract:** Parser/walker/member helpers are shared without moving ownership policies. One `analyzeProject(root)` invocation parses each authored runtime file once; later invocations reread current source.

- [x] Add real parser/helper tests and an Acorn call-count regression to `tests/test-feature-contracts.js`; prove the current repeated parses fail the new bound.
- [x] Extract only common AST mechanics. Build a per-invocation source/AST inventory and reuse it for all feature checks; preserve existing exported test helpers and contract reports.
- [x] Test mutations for unused exports, undeclared calls, and contract drift; test a second invocation after source changes to reject stale caching.
- [x] Run `node tests/test-feature-contracts.js`, the architecture/maintainability suites, and checkpoint gates; commit `refactor: share architecture AST helpers and parse contracts once`.

## Task 4: Unit-runner diagnostics

**Files:** `scripts/run-unit-tests.js`, `tests/test-unit-test-runner.js`, `docs/testing.md`.

**Contract:** Report file duration and currently running files without interleaving buffered child output. Preserve bounded concurrency and fail-fast scheduling. Timeout policy must be explicit and must not shorten real-worker regression coverage by default.

- [x] Add real child-process fixtures proving duration output, a running-file progress report, opt-in timeout failure, and no further scheduling after timeout.
- [x] Implement elapsed-time reporting and configurable progress/timeout settings; clear all runner-owned timers on completion and retain original child failure output.
- [x] Run `node tests/test-unit-test-runner.js` and checkpoint gates; commit `test: report running suites and bounded opt-in timeouts`.

## Task 5: Deferred Player loader preparation

**Files and interfaces:** Startup plan Task 2. The loader is a tested standalone ES5 capability, not yet an activated startup dependency.

- [x] Cover coalescing, ready/preloaded paths, failure/reset, destruction, late events, and callback reentrancy.
- [x] Run loader, ES5, and checkpoint gates; commit and archive before activation.

## Task 6: Atomic Player activation

**Files and interfaces:** Startup plan Tasks 1, 3, 4, 5, and Task 6's generated/release guards. Follow its integration requirements.

- [x] Add failing build, real browser-bundle, composition, lifecycle, first-Play, warm-order, and release-asset regressions before switching runtime startup.
- [x] Keep Core consumers and early ASS dependencies in Core. Move only Player-owned source and composition behind the single readiness path.
- [x] Verify construction-failure isolation, current server/profile ports, pending-intent cancellation, reverse teardown, and late-event suppression.
- [x] Record separate startup and deferred byte measurements. Run all checkpoint gates, commit, and archive a runnable integrated checkpoint.

Additional review coverage: cold Library queue capture, initial Player localization,
returned-invalid-owner cleanup, and loader callback errors including falsy thrown values.
The full-suite runner fixture now synchronizes peer failure with barriers rather than
assuming process-start overlap from 10/150 ms sleeps. No runner policy was relaxed.

Task 6 acceptance: `npm run verify` passed all 225 unit files and downstream gates;
`npm run test:memory` retained 0/200 payloads and 0/100 runtime payloads, with
+0.06 MiB net growth. `git diff --check` and `git fsck --no-dangling` passed.
Physical LG timing and playback signoff remain pending.

## Task 7: Settings backup boundary review

**Files:** `app/coordinator/settings-controller.js`, existing Settings/backup tests; a focused private interaction owner only if evidence supports extraction.

- [x] Reassess the backup interaction region after Player activation; preserve the Settings feature interface and persistence owner.
- [x] Characterize cancellation, late callbacks, exactly-once completion, same-device recovery, other-device import, and live Settings application before any extraction.
- [x] Extract only cohesive interaction logic if the tests demonstrate a safer boundary; otherwise record the specific reason to retain the current owner rather than refactoring for line count.
- [x] Run checkpoint gates for any implementation, commit the result or evidence-backed review, and archive.

## Final acceptance

- [x] Review the complete baseline-to-HEAD diff for accidental playback/subtitle/storage changes and generated freshness.
- [x] Run fresh full verify, memory, diff, and Git integrity gates; record exact results and physical-LG limits.
- [x] Reconcile current architecture/handoff documents and the active startup plan; provide the final complete checkpoint and prior task links.

## Final reviewed result

All seven implementation/review checkpoints are complete. Task 7 retains the
existing Settings interaction/persistence owners rather than extracting a wrapper.
The new real-dialog/real-format tests first reproduced teardown and repeated/late
restore effects; the bounded corrections keep normal import/identity/compatibility
semantics and accepted remote-write completion/rollback. See the
[boundary review](2026-09-06-settings-backup-boundary-review.md).

The final fresh `npm run verify` passed all **227 unit-test files** and downstream
baseline/asset/LG-static checks. `npm run test:memory` retained **0/200 payloads**
and **0/100 runtime payloads**, with **+0.08 MiB** net growth. `git diff --check`
and `git fsck --no-dangling` passed. Source/test changes were frozen before that
run; only verification records were finalized afterward.

The baseline-to-final review confirms 13 explicitly checked native/policy/schema/
format/style/version files are byte-identical. Normalized AST comparisons preserve
132 existing PlaybackController helper bodies and 219 PlayerFeatureController
helper bodies; only their destroy helpers change, plus initialization/rollback
wiring and the new Playback unbind helper. No dependency, version, migration,
subtitle algorithm, native seek, or recovery-policy change is part of this work.

Current startup-budget JavaScript is 1,747,552 bytes versus 2,208,899 at `caebbe4`;
Core is 534,196 raw / 106,346 gzip bytes, and deferred Player is 450,337 raw /
90,910 gzip bytes. Production still has four startup scripts; Player loads later.
These are payload measurements, not measured TV latency improvements.

Physical LG first-focus/first-Play/ASS/queue/playback acceptance remains explicitly
pending in the startup plan and `docs/testing.md`. The online dependency audit is
also a separate network-required release gate, not part of the offline verify run.
No push, tag, version bump, branch, or worktree was created. Final archive identity
is recorded in its root `CHECKPOINT.json`; each checkpoint contains full `.git`.

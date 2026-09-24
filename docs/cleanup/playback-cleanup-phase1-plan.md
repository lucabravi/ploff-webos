# Playback Cleanup Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce residual state and accidental complexity in `PlaybackController` while preserving all known LG/webOS playback and local-subtitle behavior.

**Architecture:** Keep `PlaybackController` as the orchestration facade and complete the ownership model already present in the repository. Move subtitle presentation-gate state to `SubtitleRuntime`, keep decoder-settlement policy in `PlaybackReposition`, keep lifecycle/transient playback state in `PlaybackSession`, and remove only playback-controller helpers/state that become provably redundant after those moves. No new framework or generic state container is introduced.

**Tech Stack:** ES5-compatible JavaScript/UMD modules, Node.js test harness, custom browser bundle build, LG webOS/Chrome 53 runtime constraints.

**Spec:** `docs/cleanup/codebase-cleanup-design.md`

## Global Constraints

- Remain on branch `develop`; do not push or tag.
- Preserve ES5/Chrome 53 compatibility and current LG/webOS behavior.
- Record `app/app.js` size against the `899972`-byte historical baseline; runtime cost is a guardrail, not a frozen target for later cleanup phases.
- Preserve Direct Play sticky recovery, keyframe/decoder settlement, startup-seek autoplay, subtitle discontinuity, and provisional-subtitle suppression.
- Preserve current recovery/subtitle diagnostics unless a diagnostic is proven redundant.
- No framework, transpiler, runtime dependency, event bus, service locator, shared mutable context, or generic DI container.
- Characterization-first TDD for every behavior-bearing refactor.
- Run `npm run verify` and `npm run test:memory` at the phase checkpoint.

---

### Task 1: Record playback cleanup inventory and deletion evidence

**Files:**
- Create: `docs/cleanup/playback-phase1-inventory.md`
- Inspect: `app/coordinator/playback-controller.js`
- Inspect: `app/subtitle-runtime.js`
- Inspect: `app/playback-session.js`
- Inspect: `app/playback-reposition.js`
- Inspect: `app/playback-recovery.js`
- Inspect: `tests/test-playback-controller.js`

**Interfaces:**
- Consumes: current owners and controller private state at `4b412d0f`.
- Produces: an evidence table classifying each playback-controller state family as `owner`, `orchestration`, `proven-dead`, or `uncertain`, with concrete call-site/test evidence.

- [ ] **Step 1: Capture current metrics and private-state families**

Run:

```sh
wc -l app/coordinator/playback-controller.js app/subtitle-runtime.js app/playback-session.js app/playback-reposition.js
wc -c app/coordinator/playback-controller.js app/app.js
rg -n '^    var ' app/coordinator/playback-controller.js
rg -n '^    function ' app/coordinator/playback-controller.js
```

Record exact output in `docs/cleanup/playback-phase1-inventory.md`.

- [ ] **Step 2: Classify the subtitle seek-presentation gate**

Document that these controller-private members form one presentation responsibility:

```text
subtitleSeekGate
beginSubtitleSeekGate()
markSubtitleSeekRebuffer()
releaseSubtitleSeekGate()
```

Trace all production call sites with:

```sh
rg -n 'subtitleSeekGate|beginSubtitleSeekGate|markSubtitleSeekRebuffer|releaseSubtitleSeekGate' app tests
```

Classify the responsibility as `owner -> SubtitleRuntime`, because it controls whether the local subtitle overlay is permitted to present during seek settlement.

- [ ] **Step 3: Classify the remaining playback state families**

For each family below, record owner and evidence rather than moving it speculatively:

```text
nativeSeekVerificationTimer -> PlaybackController orchestration pending later audit
clockRepairTimer/clockRepairFallbackTimer/generation/count -> lifecycle/timeline cross-owner, keep in facade for this phase
bufferResumeTimer/generation -> buffering orchestration, keep in facade for this phase
pendingSeek/seekTimer/pendingRestore -> cross-owner seek/reopen orchestration, keep in facade for this phase
localSubtitleRequest/generation/loading -> local subtitle loading orchestration, uncertain; characterize only
subtitleEditor* -> editor integration orchestration, out of Phase 1 move scope
playbackLoad*/playbackPrepare* -> transport request ownership, facade orchestration
recoveryTrace/rebuildReason -> diagnostics/orchestration
compatibility*Token/directFailureNotifiedToken -> compatibility dedupe, behavior-bearing
```

- [ ] **Step 4: Identify proven-dead playback symbols**

For every private symbol with zero call sites other than declaration/assignment, run repository-wide `rg`. Do not delete uncertain symbols. Add only symbols with concrete zero-consumer evidence to the inventory's `proven-dead` section.

- [ ] **Step 5: Commit the inventory**

```sh
git add docs/cleanup/playback-phase1-inventory.md
git commit -m "Document playback cleanup inventory"
```

---

### Task 2: Move subtitle seek presentation-gate ownership to SubtitleRuntime

**Files:**
- Modify: `app/subtitle-runtime.js`
- Modify: `app/coordinator/playback-controller.js`
- Modify: `tests/test-subtitle-runtime.js`
- Modify: `tests/test-playback-controller.js`
- Regenerate: `app/app.js`

**Interfaces:**
- Consumes: `SubtitleRuntime.create(options)` and the current controller functions `beginSubtitleSeekGate`, `markSubtitleSeekRebuffer`, `releaseSubtitleSeekGate`.
- Produces the following `SubtitleRuntime` API:

```js
beginSeekPresentation(waitForPlaying, targetSeconds)
markSeekRebuffer()
markSeekPlaying()
seekPresentationPending()
seekPresentationWaitingForPlaying()
seekPresentationTarget()
releaseSeekPresentation()
resetSeekPresentation()
```

The controller remains responsible for deciding *when* a seek begins/settles; the runtime owns *whether local subtitle presentation is currently gated*.

- [ ] **Step 1: Add failing SubtitleRuntime ownership tests**

Add focused tests to `tests/test-subtitle-runtime.js` asserting:

```js
runtime.beginSeekPresentation(true, 629);
assert.strictEqual(runtime.seekPresentationPending(), true);
assert.strictEqual(runtime.seekPresentationWaitingForPlaying(), true);
assert.strictEqual(runtime.seekPresentationTarget(), 629);
runtime.markSeekRebuffer();
assert.strictEqual(runtime.seekPresentationWaitingForPlaying(), true);
runtime.markSeekPlaying();
assert.strictEqual(runtime.seekPresentationWaitingForPlaying(), false);
runtime.releaseSeekPresentation();
assert.strictEqual(runtime.seekPresentationPending(), false);
assert.strictEqual(runtime.seekPresentationTarget(), null);
```

Also assert that `resetSeekPresentation()` returns the gate to the same empty state and that target `0` is preserved as numeric zero.

- [ ] **Step 2: Run the new runtime test and verify RED**

Run:

```sh
node tests/test-subtitle-runtime.js
```

Expected: FAIL because the new ownership API does not exist.

- [ ] **Step 3: Implement the minimal runtime state/API**

Inside `SubtitleRuntime.create()` add one private record, not multiple facade booleans:

```js
var seekPresentation = null;
```

Implement the exact API above. `beginSeekPresentation()` stores:

```js
{
  waitForPlaying: waitForPlaying === true,
  rebuffered: false,
  target: isFinite(Number(targetSeconds)) ? Number(targetSeconds) : null
}
```

`markSeekRebuffer()` sets `rebuffered=true` and `waitForPlaying=true` when a gate exists. `markSeekPlaying()` clears `waitForPlaying` when a gate exists. `releaseSeekPresentation()` and `resetSeekPresentation()` both clear the record. Query methods must not expose the mutable record.

- [ ] **Step 4: Run SubtitleRuntime tests and verify GREEN**

Run:

```sh
node tests/test-subtitle-runtime.js
```

Expected: PASS.

- [ ] **Step 5: Add a controller characterization assertion before rewiring**

In `tests/test-playback-controller.js`, keep the existing physical-LG regression cases and add/retain assertions for both sequences:

```text
paused seek: 629 provisional hidden -> play -> decoder settles 623 -> first visible subtitle uses 623
playing seek without waiting/stalled: 629 provisional hidden -> decoder settles 623 -> no provisional flash
```

The production change that must make these fail is bypassing `SubtitleRuntime` gate state or releasing it before settlement.

- [ ] **Step 6: Rewire PlaybackController to SubtitleRuntime ownership**

Replace controller-private `subtitleSeekGate` storage with runtime calls. Keep small facade functions only if they translate cross-owner policy; otherwise call the runtime API directly.

The controller must continue to:

```text
- begin the gate on every local-subtitle seek;
- mark rebuffer on waiting/stalled/low-readiness evidence;
- release only after the same settlement conditions used at baseline;
- hide/render through existing SubtitleRuntime methods;
- clear the gate during close/reset/reopen teardown.
```

Delete the controller's `var subtitleSeekGate` and any helper that becomes a pure pass-through.

- [ ] **Step 7: Run focused controller/runtime tests**

Run:

```sh
node tests/test-subtitle-runtime.js
node tests/test-playback-controller.js
```

Expected: PASS with unchanged golden behavior except internal ownership.

- [ ] **Step 8: Regenerate bundle and check size direction**

Run:

```sh
npm run build:app
wc -c app/app.js
```

Expected for Phase 1: bundle remains `<= 899972` bytes after wrapper effects. Later cleanup phases may accept measured growth when a reviewed ownership boundary justifies it.

- [ ] **Step 9: Commit the ownership move**

```sh
git add app/subtitle-runtime.js app/coordinator/playback-controller.js tests/test-subtitle-runtime.js tests/test-playback-controller.js app/app.js
git commit -m "Move subtitle seek presentation state to runtime"
```

---

### Task 3: Remove playback-controller pass-through helpers and proven-dead state

**Files:**
- Modify: `app/coordinator/playback-controller.js`
- Modify only if required by evidence: `app/playback-session.js`, `app/playback-reposition.js`, `app/playback-recovery.js`
- Modify: `docs/cleanup/playback-phase1-inventory.md`
- Regenerate: `app/app.js`
- Test: existing playback owner/controller suites

**Interfaces:**
- Consumes: Task 1 inventory and Task 2 ownership move.
- Produces: no new public API. Existing `PlaybackController.create()` return surface must remain unchanged unless a method is proven unused repository-wide.

- [ ] **Step 1: Re-run private-symbol reachability after Task 2**

Run:

```sh
rg -n '^    var |^    function ' app/coordinator/playback-controller.js
rg -n '<candidate-symbol>' app tests docs
```

For each candidate, only proceed when inventory evidence says `proven-dead` or when it is a pure one-line pass-through with no semantic translation.

- [ ] **Step 2: Mutation-check behavior-bearing candidates before deletion**

For each candidate that touches seek/recovery/buffering/subtitles, temporarily break or bypass it and run the smallest owning test. The test must fail for a behavior-bearing path; restore immediately. Record the test name in the inventory.

Do not commit mutations.

- [ ] **Step 3: Delete only proven-dead symbols and trivial wrappers**

Examples of acceptable deletion shape:

```js
// Before
function stopKeepalive() { timeline.stopKeepalive(); }
// all call sites use stopKeepalive() only as an alias

// After
// call timeline.stopKeepalive() directly at those sites
```

Do not inline helpers that encode a named invariant such as `settleDirectPlayDecoder`, `confirmedCompatibilityError`, or `finishTerminalPause`.

- [ ] **Step 4: Run owner/controller tests**

Run:

```sh
node tests/test-playback-session.js
node tests/test-playback-reposition.js
node tests/test-playback-recovery.js
node tests/test-playback-timeline.js
node tests/test-playback-controller.js
```

Expected: PASS.

- [ ] **Step 5: Regenerate bundle and update inventory metrics**

Run:

```sh
npm run build:app
wc -l app/coordinator/playback-controller.js
wc -c app/coordinator/playback-controller.js app/app.js
```

Record before/after metrics and exact deleted symbols in `docs/cleanup/playback-phase1-inventory.md`.

- [ ] **Step 6: Commit the dead-path/pass-through cleanup**

```sh
git add app/coordinator/playback-controller.js app/playback-session.js app/playback-reposition.js app/playback-recovery.js app/app.js docs/cleanup/playback-phase1-inventory.md
git commit -m "Remove redundant playback controller glue"
```

Only add owner files that actually changed.

---

### Task 4: Clarify retained LG/webOS playback workarounds

**Files:**
- Modify: `app/coordinator/playback-controller.js`
- Modify: `app/playback-reposition.js`
- Modify: `app/subtitle-runtime.js`
- Modify: `docs/playback-invariants.md`
- Modify: `docs/cleanup/playback-phase1-inventory.md`

**Interfaces:**
- Consumes: final ownership after Tasks 2-3.
- Produces: no runtime behavior change; comments/docs map odd-looking code to the invariant and physical-TV scenario it protects.

- [ ] **Step 1: Identify retained Class B workarounds**

At minimum document these families:

```text
Direct Play keyframe rollback/decoder settlement
startup vs seek advance thresholds
stale seek verification rejection
Direct Play sticky reopen/retry
terminal-window native clock handling
local ASS discontinuity on adopted keyframe
provisional local-subtitle presentation suppression
webOS playing/waiting/stalled ordering guards
```

- [ ] **Step 2: Add concise why-comments only where code is non-obvious**

Use comments of the form:

```js
// LG webOS may report the requested seek target before the decoder settles on an earlier keyframe.
// Keep local subtitles hidden until the native clock proves the settled frame.
```

Do not restate mechanics already obvious from function names.

- [ ] **Step 3: Update playback invariants**

Ensure `docs/playback-invariants.md` names the owning module for each retained workaround and no longer implies the facade owns state moved in Task 2.

- [ ] **Step 4: Run documentation/static gates**

Run:

```sh
npm run check:architecture
npm run check:maintainability
npm run check:es5
```

Expected: PASS.

- [ ] **Step 5: Commit retained-workaround clarification**

```sh
git add app/coordinator/playback-controller.js app/playback-reposition.js app/subtitle-runtime.js docs/playback-invariants.md docs/cleanup/playback-phase1-inventory.md
git commit -m "Document retained webOS playback invariants"
```

---

### Task 5: Phase 1 full verification and checkpoint metrics

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/cleanup/playback-phase1-inventory.md`
- Regenerate: `app/app.js`

**Interfaces:**
- Consumes: all Phase 1 commits.
- Produces: verified clean playback phase, exact before/after metrics, and handoff state for Phase 2 Player cleanup.

- [ ] **Step 1: Regenerate the runtime bundle from final sources**

Run:

```sh
npm run build:app
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```sh
npm run verify
```

Expected: PASS end-to-end.

- [ ] **Step 3: Run lifecycle memory gate**

Run:

```sh
npm run test:memory
```

Expected: PASS with no retained weak/runtime payload regression versus baseline.

- [ ] **Step 4: Verify repository integrity and budgets**

Run:

```sh
git diff --check
node scripts/check-performance-budget.js
wc -l app/coordinator/playback-controller.js
wc -c app/coordinator/playback-controller.js app/app.js
git fsck --no-dangling
```

Expected for this completed Phase 1 checkpoint: all checks pass and `app/app.js <= 899972` raw bytes. This is a historical phase result, not a permanent repository-wide freeze.

- [ ] **Step 5: Update changelog, handoff, and final inventory**

Record:

```text
baseline commit 3389735
cleanup design commit 4b412d0f
Phase 1 commit range
controller lines/bytes before and after
bundle raw/gzip before and after
symbols deleted
state ownership moved
Class B workarounds deliberately retained
verify/memory results
physical LG validation still required before release signoff
```

- [ ] **Step 6: Commit the Phase 1 checkpoint documentation**

```sh
git add CHANGELOG.md docs/cleanup/playback-phase1-inventory.md app/app.js
git commit -m "Complete playback cleanup phase one"
```

- [ ] **Step 7: Confirm clean branch state**

Run:

```sh
git status --short --branch
git log -6 --oneline --decorate
```

Expected: `develop`, clean working tree, no push/tag.

# Player Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect the known-good seek and resume behavior with executable contracts, then begin splitting player responsibilities out of `app/app.js` without changing the user experience.

**Architecture:** `app/app.js` remains the composition root and the only layer that mutates the video element. A new pure ES5/UMD seek controller receives absolute Plex time, stream offset, duration, and buffered native ranges, then decides whether a seek can be applied natively or requires rebuilding the stream. All input paths continue to delegate to the existing `seekPlayerTo()` side-effect gateway.

**Tech Stack:** ES5 JavaScript for legacy LG webOS Chromium, CommonJS-compatible UMD modules, Node.js `assert` tests, ESLint, TypeScript `checkJs`, shell baseline tests.

## Global Constraints

- Preserve support for the legacy Chromium version used by LG webOS TVs.
- Do not add runtime dependencies or a framework.
- Treat Plex positions as absolute seconds; treat `HTMLVideoElement.currentTime` as relative to the active stream offset.
- Preserve working seek behavior for remote arrows, timeline pointer input, chapters, and resume from a non-zero position.
- Keep `seekPlayerTo()` as the only side-effecting seek gateway in `app/app.js`.
- Make local commits only; do not push this development branch.
- Do not change visible player behavior in this refactor.

---

### Task 1: Pure Seek Decision Contract

**Files:**
- Create: `tests/test-player-seek-controller.js`
- Create: `app/player-seek-controller.js`

**Interfaces:**
- Consumes: `{ target, duration, offset, buffered, tolerance, forceRebuild }`, where times are seconds and `buffered` is an array of `{ start, end }` native-time ranges.
- Produces: `PloffPlayerSeekController.decide(options)`, returning `{ operation, target, nativeTime }`, where `operation` is `native` or `rebuild`.

- [x] **Step 1: Write failing behavioral tests**

Cover these independent invariants with Node `assert`:

```js
assert.deepStrictEqual(SeekController.decide({
  target: 135,
  duration: 1440,
  offset: 120,
  buffered: [{ start: 0, end: 30 }]
}), { operation: 'native', target: 135, nativeTime: 15 });

assert.strictEqual(SeekController.decide({
  target: 100,
  duration: 1440,
  offset: 120,
  buffered: [{ start: 0, end: 30 }]
}).operation, 'rebuild');

assert.strictEqual(SeekController.decide({
  target: 180,
  duration: 1440,
  offset: 120,
  buffered: [{ start: 0, end: 30 }]
}).operation, 'rebuild');
```

Also verify duration clamping, the existing 0.25-second buffered tolerance, and forced rebuild behavior.

- [x] **Step 2: Run the test and verify RED**

Run: `node tests/test-player-seek-controller.js`

Expected: failure because `app/player-seek-controller.js` does not exist.

- [x] **Step 3: Implement the pure controller**

Implement an ES5 UMD module exporting:

```js
return {
  buffered: buffered,
  decide: decide,
  normalize: normalize
};
```

`normalize(target, duration)` clamps finite values to `[0, duration]`. `buffered(ranges, nativeTime, tolerance)` checks whether native time is inside a range. `decide(options)` chooses `native` only when the target is at or after the stream offset and the relative native time is buffered; all other valid cases choose `rebuild`.

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `node tests/test-player-seek-controller.js`

Expected: `Player seek controller checks passed`.

- [x] **Step 5: Commit the independently testable module**

```bash
git add app/player-seek-controller.js tests/test-player-seek-controller.js docs/player-architecture-plan.md
git commit -m "test: lock player seek decisions"
```

### Task 2: Integrate Every Seek Input Through the Contract

**Files:**
- Modify: `app/index.html`
- Modify: `app/app.js`
- Modify: `tests/test-tv-shell.js`

**Interfaces:**
- Consumes: `PloffPlayerSeekController.decide(options)` from Task 1.
- Produces: the existing `seekPlayerTo(absoluteTime)` and `commitPlayerSeek()` behavior, now driven by a pure decision object.

- [x] **Step 1: Add failing structural integration assertions**

Assert that:

```js
assert.ok(indexHtml.indexOf('player-seek-controller.js') < indexHtml.indexOf('app.js'));
assert.ok(/var PlayerSeekController = root\.PloffPlayerSeekController;/.test(appJs));
assert.ok(/PlayerSeekController\.decide\(/.test(appJs));
```

Retain the existing assertions proving chapter selection and timeline pointer input call `seekPlayerTo()`; add an assertion that arrow seeking also calls this gateway.

- [x] **Step 2: Run the structural test and verify RED**

Run: `node tests/test-tv-shell.js`

Expected: failure because the controller is not loaded or integrated yet.

- [x] **Step 3: Wire the controller without changing timing**

Load `player-seek-controller.js` before `app.js`, bind it near the other root modules, convert `video.buffered` to plain ranges, and replace the decision branch inside `commitPlayerSeek()` with:

```js
var decision = PlayerSeekController.decide({
  target: target,
  duration: Number(currentPlayback.duration || 0) / 1000,
  offset: Number(currentPlayback.offsetBase || 0),
  buffered: playerBufferedRanges(video)
});
```

Use `decision.nativeTime` for `video.currentTime`, and call `rebuildCurrentStream(decision.target, false)` when `decision.operation === 'rebuild'`. Preserve the 250 ms input debounce and all existing clock, loading, and timeline side effects.

- [x] **Step 4: Run focused and complete verification**

Run: `node tests/test-player-seek-controller.js && node tests/test-tv-shell.js`

Expected: both pass.

Run: `npm run verify`

Expected: lint, typecheck, unit tests, baseline tests, and asset checks all pass.

- [x] **Step 5: Commit the integration checkpoint**

```bash
git add app/index.html app/app.js tests/test-tv-shell.js
git commit -m "refactor: centralize player seek decisions"
```

### Task 3: Extract Player Time and Reporting Policy

**Files:**
- Create: `tests/test-player-timeline-policy.js`
- Create: `app/player-timeline-policy.js`
- Modify: `app/index.html`
- Modify: `app/app.js`
- Modify: `tests/test-tv-shell.js`

**Interfaces:**
- Consumes: absolute playback position, media duration, suppression state, and player state.
- Produces: pure time formatting and timeline-report eligibility helpers; DOM/network side effects remain in `app.js`.

- [x] **Step 1: Write failing tests for the current reporting rules**

Cover: positions below 20 seconds are not reported, positions at or above 20 seconds are reportable, invalid positions are rejected, and short/long time formatting preserves current output.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node tests/test-player-timeline-policy.js`

Expected: failure because the module does not exist.

- [x] **Step 3: Implement and integrate the pure policy module**

Create an ES5 UMD module with `formatTime`, `formatLongTime`, and `shouldReport`. Load it before `app.js`, bind it from `root`, and replace only the matching pure logic in `app.js`; keep Plex API calls and timers in the composition root.

- [x] **Step 4: Verify focused and full suites**

Run: `node tests/test-player-timeline-policy.js && node tests/test-tv-shell.js`

Expected: both pass.

Run: `npm run verify`

Expected: all checks pass.

- [x] **Step 5: Commit the second extraction checkpoint**

```bash
git add app/player-timeline-policy.js tests/test-player-timeline-policy.js app/index.html app/app.js tests/test-tv-shell.js
git commit -m "refactor: extract player timeline policy"
```

### Task 4: Architecture Audit and Regression Documentation

**Files:**
- Modify: `docs/player-architecture-design.md`
- Modify: `docs/playback-invariants.md`
- Modify: `docs/player-architecture-plan.md`

**Interfaces:**
- Consumes: the implemented module boundaries and passing verification evidence.
- Produces: an accurate map for future incremental extraction of player session, detail, library, search, settings, setup, and navigation responsibilities.

- [x] **Step 1: Mark completed plan tasks and document actual boundaries**

Record the final module names, public functions, and the rule that no new caller may mutate `video.currentTime` or rebuild a stream outside the player coordinator.

- [x] **Step 2: Run a direct mutation audit**

Run: `rg -n "currentTime\s*=|rebuildCurrentStream\(|seekPlayerTo\(" app tests`

Expected: direct seek mutations are limited to the documented player coordinator paths and tests.

- [x] **Step 3: Run final verification**

Run: `npm run verify`

Expected: all checks pass with no lint or type errors.

- [x] **Step 4: Commit documentation and audit evidence**

```bash
git add docs/player-architecture-design.md docs/playback-invariants.md docs/player-architecture-plan.md
git commit -m "docs: record protected player architecture"
```

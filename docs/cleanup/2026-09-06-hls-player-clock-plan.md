# HLS Player Clock Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans, one verified commit/archive per task.

**Goal:** Repair HLS source/seek synchronization without reopening validated DP policy.
**Architecture:** Existing owners retain their responsibility; share source-switch orchestration
and extend bounded reposition evidence to native buffered HLS seeks, not arbitrary samples.
**Tech Stack:** Dependency-free ES5 UMD runtime, native HTML5 video, Plex HLS, local libass,
Node test harnesses and the repository's existing verification tools.
**Spec:** `2026-09-06-hls-player-clock-design.md` in this directory.

## Global constraints

- Chrome 53 / legacy LG webOS; no new runtime dependencies or syntax requirements.
- Continue `develop`; local commits/ZIP checkpoints, no push/tag/version change.
- Preserve DP startup, seek, keyframe, terminal and delivery selection regression tests.
- Keep absolute seconds at the controller boundary and relative seconds only at native HLS.
- Do not infer an HLS base from a suspicious sample, weaken gates or change delivery presets.
- Automated verification is not physical LG acceptance.

## Task 1: source transaction isolation

Files: `app/coordinator/playback-controller.js`, `app/playback-session.js`, generated
`app/player.js`; new `tests/test-playback-controller-source-clock.js` and shared test-only
`tests/helpers/playback-delivery-harness.js`; focused session tests and documentation.
Consumes the existing stream-switch/reopen guard, `anchor`, and discontinuity ownership.
Produces no new public controller API. Delayed resume belongs to one playback/stream identity.

- [x] Add failing public-flow traces for late playing before replacement readiness,
  superseded delayed resume, fractional target/ASS epoch, and same-track renderer reuse.
  Core assertions: `positionSeconds === 500`, `streamSwitching === true`, unchanged
  native play-call count while the new preparation waits, epoch target equals new offset.
- [x] Run `node tests/test-playback-controller-source-clock.js`; retain RED evidence.
- [x] Centralize source-switch begin/clock reset. Retire resume timers on a new anchor,
  validate source identity in both resume callbacks, and extend existing readiness guard
  to replacement streams. Reset HLS ASS epoch to the normalized source target.
- [x] Run focused source/session/original controller tests, then `npm run build:app`,
  `npm run verify`, `npm run test:memory`, `git diff --check`.
- [x] Review diff, commit `fix: isolate HLS source replacement clocks and resumes`, archive.

## Task 2: decoded native HLS seek settlement

Files: `app/playback-reposition.js`, controller, generated Player; new HLS clock integration
suite and focused reposition tests. Consumes absolute target/native sample/active offset,
uses buffered HLS ranges, preserves the existing DP seekable policy and numeric bounds.
Produces the existing `{clock, settled}` result consumed by PlaybackTimeline; no new owner.

- [x] Add failing tests: exact HLS target remains hidden, bounded decoded rollback
  becomes the shared clock and opens one new ASS epoch, forward advance releases pixels,
  invalid/unbuffered samples do not authorize adoption, and source changes clear settlement.
- [x] Run focused tests to capture failures before implementation.
- [x] Extend reposition's native-settlement evidence and feed it from HLS seeks;
  preserve DP startup special handling and keep explicit seek verification separate from
  source-origin validation. Reuse the same subtitle gate and discontinuity callback.
- [x] Run the full original DP/controller suites plus new HLS tests; build, verify,
  memory and diff checks. Review, commit and publish a ZIP before the next task.

## Task 3: cross-delivery review and acceptance record

Files: focused delivery integration tests, runtime fixes only for newly reproduced faults,
`docs/playback-invariants.md`, `docs/testing.md`, architecture/index and this record.

- [x] Exercise the real public flows with TC/safe-TC/DS/audio-conversion, local ASS/text,
  server-rendered and disabled subtitles. Include source-switch, native seek, buffering,
  editor Apply/Cancel, paused seek, repeated seek supersession, close and terminal cases.
- [x] Fix any newly reproduced defect test-first, without broad worker/transport changes.
- [x] Run full verify and memory again. Compare protected DP/worker/selection sources
  and unchanged original regression files against the baseline. Record measured differences.
- [x] Update implemented invariants and explicit LG acceptance steps, record remaining
  uncertainty; commit, create final archive, re-extract it and verify HEAD, tree and fsck.

### Task 1 verification record

Full `npm run verify`: PASS (233 unit-test files). Memory: PASS, retained 0/200
and 0/100; net +0.03 MiB in this run. Ten new source-clock cases pass.
The original controller behavioral suites are unchanged. The TV shell structural
guard now follows the extracted source-switch helper and still checks retirement
before recovery ownership/loading. No physical LG validation was performed.

### Task 2 verification record

Full verify: PASS (235 unit-test files); memory PASS (0/200, 0/100).
Seven HLS policy cases and eighteen cross-delivery seek traces pass. The RED runs
contained six policy failures and sixteen integration failures before implementation.
The existing DP/controller suites were not edited. A deterministic 5,000-trace
comparison (12 samples each) against baseline DP settlement produced identical results.
HLS verification timeout retains target identity; buffering inside an explicitly armed
seek consumes the same bounded settlement, without a second ASS discontinuity.

### Task 3 verification record

The 33-case delivery matrix passes, including remux/audio/video decision labels,
external/embedded ASS, SRT, server captions, off, forced-transcode policy, terminal
pause intent, and track changes. Twelve editor clock traces and the focused runtime
ownership test pass. The reproducible faults were preview-owner pause delivery and
queued HLS canplay at readyState 0; no product behavior was changed to match mistaken
initial test assumptions about the remote-mode label, DS fractional origins or
terminal auto-pause (see test-development evidence in the checkpoint logs).

Full verify: PASS (238 unit-test files), memory PASS (0/200, 0/100).
The only baseline test file edited is the TV-shell structural helper guard.
DP policy comparison remains identical on 5,000 deterministic traces. Protected
clock/driver/strategy/URL/renderer/vendor/Core/dependency files are byte-identical.
Physical TV and live Plex acceptance remain pending; additional steps are documented
in testing.md. Verification logs and archive integrity evidence accompany each ZIP.

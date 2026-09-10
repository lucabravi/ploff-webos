# Player cleanup Phase 2 inventory

Date: 2026-09-06
Phase baseline: `7119b71` (Playback Phase 1 complete)

## Baseline metrics

| Metric | Value |
| --- | ---: |
| `player-feature-controller.js` lines | 2850 |
| `player-feature-controller.js` bytes | 137336 |
| generated `app/app.js` raw bytes | 899704 |

## Ownership findings

### `queueGapVisible` - duplicate state, remove

`QueueGapController` already owns `open`, focus and confirmation state and exposes it through `snapshot()`. `PlayerFeatureController.renderQueueGap()` mirrors `snapshot.open` into `queueGapVisible`, and `queueGapOpen()` reads only that mirror. Existing Player tests cover opening, confirming/cancelling and invalidating the modal from manual Next and Up Next paths. The facade boolean adds a second source of truth with no independent semantics.

Implemented: keep `queueGapOpen()` as the semantic facade query, derive it through the owner's O(1) `QueueGapController.isOpen()` query, and remove `queueGapVisible`. The direct `snapshot()` approach was rejected by a hot-path test because it clones confirmation state unnecessarily.

### `resumeChoiceVisible` - duplicate state, remove

Every close/start path that writes `resumeChoiceVisible=false` also clears `resumeChoiceState=null`; the only open path creates a non-null `ResumeChoice` state before setting the boolean true. Input routing, pointer routing, standalone return value and feature snapshot can therefore derive visibility from `resumeChoiceState !== null`.

Existing Player tests cover resumable open, pointer Cancel and standalone resume-disabled behavior. The state object is now the authoritative ResumeChoice domain state; `resumeChoiceVisible` has been removed.

### Retained Player state

The following are not duplicate-state cleanup targets in this phase:

- `playerErrorVisible/index/retry/fallback`: error overlay can be visible with nullable actions and has independent focus state;
- `subtitlePanelTransitionTimer`: cross-panel animation sequencing between controls/settings/editor;
- container transition timers/generation: stale-transition protection around container Direct Play origin restoration;
- `autoplayPrefetchImage`: owned resource handle requiring event-handler teardown;
- `nextAssTarget/nextAssPrefetchKey`: bounded prefetch dedupe state;
- `queueGapSource/queueGapGeneration`: request-origin and stale-generation context not represented by `QueueGapController`'s presentation snapshot.

## Monouse pure-wrapper scan

The lexical scan found these definition + one-consumer one-line candidates:

- `activeServerSnapshot()` -> port alias;
- `refreshEpisodePlaybackState()` -> detail port alias;
- `reconcileLibraryPlaybackProgress()` -> library port alias;
- `renderPlayerSettingsState()` -> local alias;
- `togglePlayback()` -> Playback alias.

All five candidates were removed after focused characterization:

- `renderPlayerSettingsState()` now passes `updateSettingsDisplay` directly;
- `activeServerSnapshot()` is inlined inside the identity helper;
- `refreshEpisodePlaybackState()` calls the detail port directly at playback close;
- `reconcileLibraryPlaybackProgress()` calls the library port directly at playback close;
- `togglePlayback()` binds the toggle button directly to `playbackController.toggle`.

Functions that transform data, guard state, name domain behavior or are passed as callbacks remain named even when they have one consumer. No declaration-only Player private symbol was found by lexical scan.

## Phase result so far

| Metric | Baseline | Current | Delta |
| --- | ---: | ---: | ---: |
| `player-feature-controller.js` lines | 2850 | 2841 | -9 |
| `player-feature-controller.js` bytes | 137336 | 136675 | -661 |
| generated `app/app.js` raw bytes | 899704 | 899156 | -548 |

The reduction comes from removing duplicate facade state and pure aliases. No Player behavior or public contract has been intentionally changed.

## Verification checkpoint

- `npm run verify`: PASS
- `npm run test:memory`: PASS (`0/200`, `0/100`, net heap `+0.03 MiB`)
- performance budget: `899156 / 900000` raw, `177581 / 190000` gzip
- `git diff --check`: PASS
- `git fsck --no-dangling`: PASS

Physical LG validation remains a release-signoff requirement; this phase intentionally changes ownership/glue only.


# Detail cleanup Phase 3 inventory

Date: 2026-09-06
Phase baseline: `d4ffa7d`/Phase 2 verified runtime state (`app/app.js` 899156 raw bytes)

## Baseline metrics

| Metric | Value |
| --- | ---: |
| `detail-feature-controller.js` lines | 1872 |
| `detail-feature-controller.js` bytes | 89509 |
| generated `app/app.js` raw bytes | 899156 |

## Ownership findings

### `pendingProgress` - move to DetailController

`DetailFeatureController` currently owns a six-second local playback checkpoint, but the checkpoint exists only to patch and reconcile `currentDetail`, `selectedItem`, and `seriesContext.episodes`. Those models are already authoritative state in `DetailController`, which exposes semantic patch methods. Keeping `pendingProgress` in the facade splits ownership and forces repeated snapshots/patch loops.

Target: `DetailController` owns the checkpoint and reconciliation policy; the feature owns Plex `loadSeasonEpisodes`, episode-card repaint, and delayed retry scheduling.

### Retained state

- `entered`: feature lifecycle/idempotent leave guard; controller model presence is not equivalent because playback-context setup may retain data independently of visible entry.
- `lastPresentationKey`: presentation-transition/image cleanup guard.
- `seasonBulkPending`: prevents overlapping multi-write Plex mutations.
- `seasonPreviewRequest` / `episodePreviewRequest`, `ownedRequests`, `featureTimers`: async resource ownership and stale callback cancellation.
- `seasonActivationToken`: stale season activation protection beyond the controller's preview token.
- `extendedRootDetail`, `extendedRootKey`, `extendedMetadataKey`, `extendedExtrasKey`: coordinator-side root cache and in-flight dedupe; `DetailExtendedView` intentionally owns only presentation state and does not expose the underlying detail/extras model.

## One-consumer scan

The scan finds several helpers with one consumer, but most encode domain/presentation semantics (`detailRootKey`, transition preparation, metadata refresh level, season hydration, extended loading). They are not deletion targets merely because call count is low. Public facade adapters such as summary/focus/preference methods remain because feature-contract consumers depend on them.

## Implemented ownership move

`pendingProgress` was removed from `DetailFeatureController`. `DetailController` now owns the bounded six-second checkpoint through semantic methods that record local playback progress, reconcile fresh season playback state, and report whether Plex is still behind. The feature retains Plex I/O, repaint and retry scheduling only.

The first implementation increased the phase-local bundle by 430 bytes. It was simplified using the controller's existing mutation primitive rather than duplicating patch helpers. Two additional pure monouse aliases (`detailChoiceState`, `browsingView`) were then removed. No semantic one-consumer transition/async helper was deleted.

## Phase result

| Metric | Baseline | Final | Delta |
| --- | ---: | ---: | ---: |
| `detail-feature-controller.js` lines | 1872 | 1812 | -60 |
| `detail-feature-controller.js` bytes | 89509 | 86067 | -3442 |
| `detail-controller.js` lines | 594 | 654 | +60 |
| generated `app/app.js` raw bytes | 899156 | 899405 | +249 |

The phase-local byte increase is accepted because model ownership is now singular and the cumulative cleanup remains below the behavior baseline (`899405` vs `899972`, -567 bytes) and below the hard 900000-byte budget.

## Verification checkpoint

- `npm run verify`: PASS
- `npm run test:memory`: PASS (`0/200`, `0/100`, net heap `+0.09 MiB`)
- performance budget: `899405 / 900000` raw, `177602 / 190000` gzip from the verification gate
- `git diff --check`: PASS
- `git fsck --no-dangling`: PASS

Physical LG validation remains required before release signoff.

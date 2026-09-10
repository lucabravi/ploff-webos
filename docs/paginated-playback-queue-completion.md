# Paginated Playback Queue Completion

## Status

The implementation plan for origin-aware paginated playback sequences is complete
at repository level. Series, Playlist, and Collection origins now use bounded
providers and one semantic adjacent-result contract. Native playback ownership is
unchanged and remains exclusively in `playback-controller.js`.

Physical LG webOS verification remains a release signoff requirement and is not
replaced by this document.

## Delivered Architecture

- `queue-sequence-contract.js` defines stable occurrence identities and the four
  adjacent states.
- `bounded-queue-cache.js` enforces five resident pages, 40 records per page, and
  200 resident records while retaining lightweight eviction descriptors.
- `plex-container-queue-provider.js` preserves Plex order and duplicate
  occurrences for Playlist and Collection origins.
- `series-queue-provider.js` isolates regular seasons from Specials, resolves
  numeric season and episode gaps, and pages the logical series by season segment.
- `playback-queue-controller.js` owns provider selection, drawer windows,
  Previous/Next, Up Next, current occurrence state, and request invalidation.
- `queue-gap-controller.js` and `queue-gap-view.js` own the shared confirmation
  lifecycle and presentation.
- `player-feature-controller.js` wires semantic targets into the existing Player
  start path without moving native-video algorithms.

## Locked Invariants

- Playlist and Collection duplicates remain distinct by origin, absolute position,
  and media identity.
- Regular-series origins never enter Specials; Specials origins never enter
  regular seasons.
- Missing season or episode numbers require explicit confirmation before playback.
- A short container page establishes a monotonic terminal boundary.
- Changed evicted pages or season segments are rejected within the same generation.
- Transport exceptions and malformed pages release ownership and remain retryable.
- Queue restoration preserves absolute index, current item, and occurrence identity.
- Changing the current episode invalidates adjacent decisions owned by the previous
  occurrence without discarding safely completed season metadata.
- Metadata, DOM, SD artwork, and final artwork windows remain independently bounded.
- Queue providers never touch `video.src`, `video.currentTime`, playback clocks,
  recovery, reporting, tracks, versions, or subtitle offsets.

## Automated Acceptance

The repository gates cover provider contracts, cache peaks, duplicate occurrence
identity, Specials isolation, every gap direction, modal lifecycle, generic
adjacent resolution, Up Next cancellation, virtualized drawer windows, stale and
synchronous-abort callbacks, malformed responses, current-occurrence replacement,
ECMAScript 5 compatibility, architecture ownership, bundle determinism, type
contracts, assets, and LG UX.

Before delivery run:

```sh
npm run check:app-bundle
npm run check:coordinator
npm run check:architecture
npm run check:feature-contracts
npm run check:performance
npm run check:es5
npm run lint
npm run typecheck:contracts
npm run typecheck
npm run test:unit
npm run test:baseline
npm run check:assets
npm run check:lg-ux
git diff --check
git fsck --no-dangling
```

When development dependencies are unavailable in a clean source ZIP, record the
exact unavailable gate and run every supported check separately without claiming
that the unavailable command passed.

## Remaining Physical-TV Signoff

Verify Direct Play, Direct Stream, transcoding, resume, seek, Playlist and
Collection duplicates, long queue scrolling, direction reversal, Up Next, gap
confirm/cancel, Specials isolation, queue-origin restoration, remote input, Magic
Remote input, artwork correctness, and stable memory on a supported LG webOS TV.
Use the normalized matrix and release-signoff process in `testing.md`.

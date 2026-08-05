# Queue, Playlist and Profile UX Design

## Status

Approved from physical-TV feedback and retained as the current behavior reference for queue, playlist, and profile presentation.

## Goals

1. Keep downward queue navigation visually anchored: unless the focused entry is the final queue entry, one complete following card remains visible below it.
2. Make the current queue entry unmistakable with an accent marker that shows Play while media is playing and Pause while media is paused, in addition to its accent border.
3. Make the focused queue entry easier to recognize with a very small looping scale pulse that respects the global animation setting.
4. Return from playlist playback directly to the opened playlist container, never to a partially initialized media-detail surface.
5. Show a playlist heading and aggregate progress statistics on the opened playlist page.
6. Disable the Collections tab when its library has no collections, using the same native-disabled and unfocusable behavior as an empty Continue Watching tab.
7. Refresh Plex Home profiles without a visible redraw or loading flash when cached profiles and refreshed profiles are presentation-equivalent.

## Queue drawer behavior

The scroll policy is a pure function in `playback-queue-model.js`. It receives the viewport geometry, focused-card geometry, next-card geometry and navigation direction. During downward movement, a non-final focused card scrolls just enough to keep the following card fully visible. Upward movement retains the existing nearest-edge behavior. The last card may occupy the final visible slot.

The drawer card for the active media renders a CSS badge with an accent outline. It shows Play while media is playing and Pause while media is paused, and updates without rebuilding the drawer. The focused card uses a subtle two-state scale animation of approximately one percent. `body.animations-disabled` continues to collapse the animation to one iteration through the existing global rule.

## Playlist restoration and progress

The playback queue retains the originating container. On player close, a playlist-backed queue with a live playlist container restores the existing library container surface directly. It does not reopen or synthesize the current media detail.

Playlist progress uses the complete paginated container, not only the visible first page. `LibraryLifecycle` owns a cancellable, generation-bound summary request alongside its existing page request. The summary is computed with the pure queue model:

- `totalCount`: playable entries;
- `watchedCount`: entries marked viewed;
- `remainingCount`: total minus viewed;
- `watchedDuration`: full duration for viewed entries plus bounded `viewOffset` for partially watched entries;
- `remainingDuration`: total duration minus watched duration.

The global playlist header becomes `Playlist: <title>` while a playlist container is open. A compact top-right statistics block shows watched/remaining counts and watched/remaining time. It is hidden on the global playlist index and for non-playlist containers.

## Collections availability

`LibraryLifecycle` performs a one-item Collections probe in parallel with the existing Continue Watching probe. Requests are abortable and generation-bound. The Collections tab is native-disabled, skipped by remote navigation and ignored by pointer activation when unavailable.

## Profile refresh stability

When cached profiles already exist, entering the profile chooser renders them once and refreshes in the background without enabling the title spinner. On success, the controller compares the presentation fields (`id`, `title`, `thumb`, `protected`) and only publishes another render if they changed. Internal refreshed profile objects are retained even when no render is needed. Errors retain the existing explicit error behavior.

## Compatibility and ownership

- Runtime remains ES5 / Chrome 53 compatible.
- No Promise, async/await, classes, native modules, runtime dependencies or transpilation.
- `app/app.js` is regenerated only by `scripts/build-app.js`.
- Playback clock, seek, rebuild, recovery and reporting are untouched.
- Every new request is abortable and invalidated on leave/destroy.
- The Repomix file remains a read-only index; changes apply only to original repository files.

## Verification

Each behavior receives a regression test before implementation. Final verification includes bundle freshness, coordinator syntax, unit tests, baseline checks, assets, LG UX checks, lint where the environment supports the installed toolchain, normalized TypeScript diagnostics, and `git diff --check`.

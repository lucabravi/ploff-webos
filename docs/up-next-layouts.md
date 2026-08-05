# Up Next Layouts

> Canonical design and behavior reference. The former duplicate under
> `docs/designs/` was removed so release and implementation documentation now
> describe the same surface.

## Goal

Show the next playable item only after the current media has actually ended. The video remains stopped on its final frame while the selected countdown runs. The same behavior applies to every active playback queue, including series, playlists, collections, and mixed movie/episode queues.

## Settings

Add a player preference named `Up Next layout` with two values:

- `compact` (default): a small card in the lower-right corner.
- `bottom-panel`: a compact lower band, no synopsis, limited to 35% of the screen height.

The standard settings row shows the selected value. Selecting it opens a dedicated visual choice dialog with two 16:9 schematic previews. Directional navigation changes the pending choice; `OK` applies it and `Back` or `Cancel` leaves the current setting unchanged.

`autoplayDelay` is the number of seconds to wait after playback ends. A value of `0` disables automatic next-item playback. This timing applies uniformly to series, playlists, collections, and mixed queues.

## Playback Behavior

When the native player fires `ended` and the active queue has another playable item:

- resolve the following item from the generic playback queue;
- show the selected layout with a simple opacity transition;
- display the next item title and a live `Starts in N seconds` countdown;
- show a turquoise progress bar which drains over the same interval;
- set initial focus to `Play now`;
- use Left and Right to move between `Play now` and `Cancel`;
- use `OK` to activate the focused action, physical Play to start immediately, and Back to cancel;
- preserve queue order, duplicate occurrences, media-version affinity, and resume behavior.

When the queue is exhausted, the same countdown surface targets Home instead of a
fictional media item. Letting the timer expire or choosing `Go to Home` closes the
player and opens Home. Cancelling leaves the final video frame visible with a centered
Pause overlay; that overlay exists only at the true end of the video and disappears on
seek, new playback, or leaving the player.

The queue is hydrated during playback. If it is still loading when playback ends, Up Next waits briefly for the adjacent item instead of assuming the queue is finished. Once the adjacent item is known, Ploff prefetches only its 640×360 backdrop preview without changing the visible player; the 1920×1080 artwork remains progressive after Up Next opens.

## Accessibility and Compatibility

Both layouts retain LG-sized controls and visible remote focus. They use ordinary DOM/CSS only, with no animation features beyond opacity and a width-based progress bar compatible with Chromium 53.

## Validation

Add focused tests for settings validation/defaults, the visual choice model, post-ended timing, remote focus navigation, generic queue adjacency, cancellation, and default compact layout. Run the full verification suite and package build before deployment.

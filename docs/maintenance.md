# Runtime Maintenance

`app/app.js` intentionally remains the view coordinator. State calculations
with stable inputs belong in small ES5 modules under `app/`. Detail
presentation, player controls, chapters, and subtitle-editor presentation own
their DOM through injected dependencies. Native video lifecycle, Plex playback
requests, timeline timers, and stream replacement remain in the coordinator so
they retain one owner.

When adding asynchronous work:

- give each view-owned request a generation or identity check;
- abort cancellable requests when leaving the view;
- clear timers in the matching close/stop function;
- suppress stale callbacks before they mutate DOM or playback state;
- keep only one owner for player timeline, recovery, and keepalive timers;
- add a focused module test before extracting shared state.

Do not split the file solely to reduce its line count. The current extracted
modules cover navigation, playback timing/recovery, chapters, subtitles,
images, settings, and view state; further extraction should target a measured
bug-prone lifecycle rather than generic helpers.

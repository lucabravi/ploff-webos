# Runtime Maintenance

`shell/app.js` intentionally remains the view coordinator. State calculations
with stable inputs belong in small ES5 modules under `shell/`; native player,
DOM, and view lifecycle code remains in the coordinator unless an extraction
removes a concrete race or makes a risky behavior independently testable.

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

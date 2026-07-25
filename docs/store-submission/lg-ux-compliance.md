# LG TV UX Compliance

This document separates static safeguards from checks that must be performed on
a physical LG TV before submission. It follows the current LG webOS TV App
Self-Checklist, Magic Remote guide, and Back-button guide.

Official references:

- [App Self-Checklist](https://webostv.developer.lge.com/distribute/app-self-checklist)
- [Magic Remote](https://webostv.developer.lge.com/develop/guides/magic-remote)
- [Back Button](https://webostv.developer.lge.com/develop/guides/back-button)

## Automated baseline

Run:

```sh
npm run check:lg-ux
```

The check protects the following implementation contracts:

- 1920 x 1080 application canvas and app-controlled Back handling;
- four-way navigation, OK, and webOS Back key mappings;
- pointer, click, and wheel listeners used by Magic Remote;
- visible focus styles for generic, media, and player controls;
- startup, view, server-activity, and playback loading cues;
- 20 px minimum card text and 54 px minimum compact control targets.

LG describes text and target dimensions as recommendations, while complete
remote navigation, pointer operation, Back behavior, and visible selection
effects are submission requirements. Ploff uses 54 px as the compact-control
floor and larger targets for primary actions where the layout permits it.

## Physical-TV test matrix

Record model, webOS version, app version, date, and tester in the release
signoff. Every row must pass with directional keys, OK, and Back. Repeat pointer
and wheel checks where applicable.

| Area | Directional / OK | Back | Pointer / wheel | Focus and loading |
| --- | --- | --- | --- | --- |
| First launch and onboarding | Select language, server, login mode, and profile | Cancels dialogs or returns one step | Select every visible action | Focus remains visible; discovery and login show progress |
| Home and navigation | Traverse rows and all navigation items | Returns to the expected home position | Select cards and navigation; wheel moves according to preference | Selected card remains visible while rows scroll |
| Search and T9 | Enter, delete, submit, and open a result | Deletes or closes in the documented order | Select keyboard keys and results | Search progress never captures focus |
| Library views | Switch tabs, sorting, watched filter, advanced filters, and cards | Scrolls to top before leaving where specified | Select controls and cards; wheel traverses content | Empty/error states do not steal focus |
| Watchlist, playlists, collections | Open available content and empty states | Returns to Home with correct navigation state | Select cards and navigation | Empty/error messages remain non-modal |
| Settings and diagnostics | Traverse every row, choice dialog, privacy view, and diagnostics action | Closes the active layer before leaving | Select rows and modal choices | Long diagnostics content scrolls without losing focus |
| Media detail | Seasons, play, watched, watchlist, metadata, tracks, versions, episodes | Closes expanded content before leaving detail | Select every action and episode | Detail loading does not expose stale selectable data |
| Player | Play/pause, seek, previous/next, settings, tracks, chapters, skip markers | Closes the topmost layer, then exits player | Toggle video, seek timeline, choose controls and chapters | Controls, reduced timeline, spinner, and errors remain coherent |
| Recovery | Resume after buffering, network loss, app backgrounding, and stream rebuild | Remains deterministic during recovery | No stale pointer target activates | Spinner disappears after playback resumes |

## Visual review

- No selectable object may lack a visible focus/selection state.
- Focus must not be clipped at the viewport or scroll-container edges.
- Focused content must be scrolled fully into view.
- Loading indicators must appear only while work is pending and must not take
  navigation focus.
- Body text and interactive labels should be at least 20 px at 1920 x 1080.
- Compact interactive targets must be at least 54 x 54 px; primary icon actions
  should use approximately 75 x 75 px where practical.
- Disabled controls must look disabled and must be skipped by directional
  navigation.

Passing the automated check is necessary but does not replace this physical-TV
matrix.

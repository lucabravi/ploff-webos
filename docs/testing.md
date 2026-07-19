# Testing

Run automated checks first:

```sh
for test in tests/test-*.js; do node "$test"; done
sh tests/test-baseline.sh
```

## Clean-Room Release Check

Use a temporary clone or exported source tree with no previous `dist/`, local
configuration, browser storage, or webOS application data:

1. Clone the release commit into a new directory and confirm `git status` is
   clean and `shell/config.local.js` is absent.
2. Install exactly `@webos-tools/cli@3.2.5` and run
   `./scripts/package-tv-shell.sh`.
3. Run `./scripts/inspect-ipk.sh`; verify the reported application version and
   webOS CLI version in the packaged `build-manifest.txt`.
4. Install the IPK on a TV after removing the previous Ploff application. The
   first screen must be onboarding, with no preselected personal server.
5. Verify GDM discovery, then reset application data and verify manual local
   address entry.
6. Complete offline setup and play from a trusted unauthenticated LAN server.
7. Reset again, link at `plex.tv/link`, select a Plex Home profile, and verify a
   LAN or account-provided remote/Relay server.
8. Restart the TV and confirm the selected server and profile are restored.
9. Temporarily remove internet while leaving the LAN server available; cached
   profiles and local playback must continue to work.
10. Temporarily stop or isolate the server; the UI must remain usable and offer
    retry/manual server selection without disclosing an authenticated URL.

Steps 1-3 are reproducible locally and in CI. Steps 4-10 require a physical TV,
a test Plex account/server, and deliberate network changes; never perform them
against another user's server or media state.

Before a release, verify these cases on a target webOS TV:

1. Open Home, search, every library tab, a collection, and a local playlist.
2. Change poster size at 70%, 100%, and 130%; confirm focus, wheel scrolling,
   overscan rows, and artwork resolution stay aligned.
3. Resume a partially watched item, seek both directions, then change audio,
   subtitles, and media version without losing the absolute position.
4. Test Auto, Direct only, and Force transcode with a compatible file and a
   file that needs fallback. Confirm Retry stops after the bounded ladder.
5. Test 1080p SDR and, when supported by the TV, 4K HDR10. Compare the source,
   device, HDR, and effective playback diagnostics shown in player settings.
6. Disconnect and reconnect the LAN while Home, a library, detail, and playback
   are active. The current view must recover without resetting saved settings.
7. At the last episode of a regular season, use Next and confirm the first
   episode of the next non-empty regular season starts. Repeat backwards and
   confirm Specials are never selected automatically.
8. Explicitly play a partially watched item. Test Resume, Play from beginning,
   Cancel, and Back; verify Previous, Next, and autoplay do not show the prompt.
9. Open Advanced subtitle settings with external SRT/WebVTT and embedded text
   subtitles. Test +/-100 ms, size, Loop 5s, Apply, and Cancel while playing and
   paused. Confirm both exits restore the exact captured position and state.
10. Confirm ASS/SSA, PGS, VobSub, and image subtitles show Advanced settings as
    Unsupported while ordinary subtitle playback remains available.
11. Open User diagnostics from the final application-settings row. Verify the
    current or last playback, local server identity, capabilities, strategy,
    buffered ranges, and errors update; then leave it and confirm polling stops.
    No Plex token, authenticated URL, or complete machine identifier may appear.
12. Open Chapters from Play and with the Magic Remote pointer. Confirm low-res
    thumbnails upgrade in place, the current chapter is focused, and seeking to
    a chapter still permits repeated backward and forward seeks.
13. Switch among every supported interface language. Confirm generated media
    labels, player accessibility labels, episode counts, and empty/error states
    change language without changing titles supplied by Plex.
14. Change library sorting and watched filters while scrolling a virtualized
    catalog. Confirm recycled cards never retain the previous title, rating,
    progress, or artwork and that posters remain uncropped.

The `1920x1080` manifest resolution is the application UI canvas. On UHD TVs,
webOS can still decode a 3840x2160 video surface; actual Direct Play and HDR
support depends on the model and source codecs.

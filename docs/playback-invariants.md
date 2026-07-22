# Playback invariants

These rules are based on tests performed on the target LG webOS TV. Do not
change the playback clock model without reproducing every case below.

## Plex HLS clock

- Use `fastSeek=1`. With `fastSeek=0`, Plex may expose a shortened timeline
  while delivering content from near the beginning of the source.
- Start server-offset streams at the exact absolute Plex position. A stream
  anchored at zero cannot seek reliably to a distant resume point, even after
  waiting two seconds after `canplay`.
- On the target TV, `video.currentTime` is relative to the HLS stream offset.
  The absolute Plex position is `stream offset + video.currentTime`.
- Plex timeline reports, the progress bar, and the end-time estimate must use
  the absolute Plex position.
- `waiting` and `stalled` freeze the last confirmed absolute position. A
  transient native clock sample during buffering must never alter the UI or a
  Plex timeline report.
- Outside an explicit seek, the public clock is monotonic. A native regression
  larger than two seconds after playback resumes is treated as a decoder clock
  discontinuity and rebuilds once at the last confirmed absolute position.
  Never repeatedly seek the same unstable stream to repair its clock.
- Stream replacement anchors and freezes the public clock before changing the
  offset, so a new offset can never be added to the previous stream's stale
  `currentTime`.

## Seeking

- Every UI seek target is expressed in absolute Plex seconds and enters through
  `seekPlayerTo()`. Inputs must never subtract the stream offset themselves.
- Forward seek inside the current HLS window assigns
  `absolute target - stream offset` to `video.currentTime`.
- Direct Play follows `video.seekable`, allowing the browser to request an
  unbuffered portion of the original file through HTTP Range. Every native
  seek is verified against the requested position and has a bounded timeout.
- Offset HLS streams use `video.buffered` for native seeks. A target outside
  the active buffer rebuilds at the exact absolute target instead of assigning
  an unsafe relative `video.currentTime`.
- If a Direct Play seek fails, times out, or later regresses, recovery advances
  to an offset-capable Direct Stream. Transcoding remains a later bounded
  fallback according to the selected playback mode.
- Backward seek before the current stream offset rebuilds at the exact target.
  The old frame is held while webOS replaces the stream, and playback is
  retried after `canplay` so the seek lock cannot remain stuck.
- Track changes rebuild at the current absolute Plex position and must not
  restart from zero or apply an additional seek.
- Chapter selection uses the same absolute seek path as the timeline and remote
  arrows. A chapter seek must never create a separate clock or bypass stream
  namespace rotation.
- Ordinary stream rebuilds assign the new source synchronously. Plex decision
  requests are reserved for initial playback and bounded recovery so a slow
  decision endpoint cannot leave remote input locked during a seek.

## Automated guards

- `tests/test-player-seek-controller.js` locks normalization, Direct Play
  `seekable` handling, buffered HLS seeking, target verification, pre-offset
  rebuild, native-duration validation, tolerance, and clock recovery behavior.
- `tests/test-player-timeline-policy.js` locks the 20-second reporting boundary
  and both time formats.
- `tests/test-tv-shell.js` verifies that remote arrows, timeline pointer input,
  and chapters still delegate to the absolute seek gateway and that the
  gateway delegates its decision to `PloffPlayerSeekController`.
- `npm run verify` is required after every player extraction. Passing browser
  tests do not replace the manual LG decoder matrix below.

## Subtitle synchronization editor

- Opening the editor captures the absolute position and paused/playing state.
- Its five-second preview suppresses Plex timeline reporting and never changes
  the captured restore point.
- Apply and Cancel both rebuild at that exact point and restore the captured
  paused/playing state.
- External SRT/WebVTT offsets are written to Plex. Convertible embedded text
  offsets are rendered locally and persisted by server, part, and stream.
- ASS/SSA, PGS, VobSub, image subtitles, and failed conversions must keep the
  editor disabled without preventing ordinary playback.

## Regression matrix

1. Resume: content and displayed timer start at the same saved position.
2. Forward 10 seconds: content and timer both advance by 10 seconds.
3. Backward 10 seconds at stream start: a new stream opens at the requested
   earlier position and continues playing.
4. Repeated backward seeks: input is accepted after each rebuild.
5. Audio or subtitle change: content resumes at the same absolute position.
6. Plex progress reports always contain the displayed absolute position.
7. Apply subtitle timing: content, timer, and paused/playing state are restored.
8. Cancel subtitle timing: no stream, size, offset, or progress change remains.
9. Buffering: the timer remains fixed until playback resumes and never jumps
   backward because of a transient native clock reset.
10. Unexpected clock regression: the stream is rebuilt once at the last
    confirmed absolute position before progress reporting continues; the
    decoder must never oscillate between two native positions.
11. Chapter selection: content and timer start at the selected chapter, then
    both backward and forward seeks remain responsive.

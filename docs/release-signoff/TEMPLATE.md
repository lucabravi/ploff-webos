# Physical-TV release signoff: v<major>.<minor>.<patch>

- Date: <YYYY-MM-DD>
- TV model: <model>
- webOS version: <version>
- Tester: <name>
- Result: <PASS or FAIL>
- Matrix SHA-256: f518dcf08293e862096559680c8301a4e66a4c1510b6a19218a848e52d840ad0
## Regression matrix

Copy this file to `docs/release-signoff/v<major>.<minor>.<patch>.md`, replace
all placeholders, and check each item only after completing the corresponding
physical-TV test in `docs/testing.md`. `Matrix SHA-256` identifies the exact normalized
matrix. Do not copy a new digest into an older signoff; any matrix change requires a new
physical run. The repository test keeps this template digest synchronized.

- [ ] 1. Startup, onboarding, server/profile loading, refresh stability, and restart
- [ ] 2. Home focus, navbar long-press, Search T9, libraries, Watchlist, and playlists
- [ ] 3. Sorting, filters, virtual cards, catalog Detail/Back restoration, and disabled empty Collections
- [ ] 4. Detail origins, contextual watched/progress actions, More Details snap/focus, media mutations, version browser, season bulk actions, theme continuity, and Back restore
- [ ] 5. Direct Play, sticky Direct Play recovery, Direct Stream, transcode modes, HDR diagnostics, and repeated buffering-clock recovery
- [ ] 6. Resume, play from beginning, initial-startup seek autoplay, bidirectional/offset seek, timeout/mismatch/terminal sticky retry, buffering pause/seek supersession, rebuild, and recovery
- [ ] 7. Audio, subtitles through 200%, global renderer confirmations, renderer transitions/seek, paused/no-rebuffer seek presentation gating, late keyframe ASS invalidation, buffering clock parity, local-renderer badge, ASS karaoke, advanced synchronization, and unsupported formats
- [ ] 8. Playlist/episode queues, drawer content, playing badge, and focus positioning
- [ ] 9. Up Next resolution/countdown/seek cancellation/re-arm and skip-prompt focus/OK/consumption behavior
- [ ] 10. Chapters, Previous/Next, Back/Stop, and exact playback-origin restoration
- [ ] 11. Magic Remote hover, click, wheel, timeline, queue, and long-press behavior
- [ ] 12. LAN/internet loss, short/long playback interruption, and recovery across every active application view
- [ ] 13. User diagnostics, buffering-clock evidence, redaction, state accuracy, and polling teardown
- [ ] 14. Poster sizes, artwork/backdrop quality, overscan, languages, accessibility, and focus visibility
- [ ] 15. Multi-server route priority, partial-results recovery, library/Home aggregation, alternate copies, server ownership, and disable/re-enable behavior

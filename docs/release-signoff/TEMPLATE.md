# Physical-TV release signoff: v<major>.<minor>.<patch>

- Date: <YYYY-MM-DD>
- TV model: <model>
- webOS version: <version>
- Tester: <name>
- Result: <PASS or FAIL>
- Matrix SHA-256: db61ef2501c103daa269f138bfa353f24ce7da7b677ffe42c0fdb356d4f511a3
## Regression matrix

Copy this file to `docs/release-signoff/v<major>.<minor>.<patch>.md`, replace
all placeholders, and check each item only after completing the corresponding
physical-TV test in `docs/testing.md`. `Matrix SHA-256` identifies the exact normalized
matrix. Do not copy a new digest into an older signoff; any matrix change requires a new
physical run. The repository test keeps this template digest synchronized.

- [ ] 1. Startup, onboarding, server/profile loading, refresh stability, and restart
- [ ] 2. Home focus, navbar long-press, Search T9, libraries, Watchlist, and playlists
- [ ] 3. Sorting, filters, virtual cards, empty states, and disabled empty Collections
- [ ] 4. Detail origins, media mutations, theme continuity, media info, and Back restore
- [ ] 5. Direct Play, Direct Stream, transcode modes, HDR diagnostics, and recovery
- [ ] 6. Resume, play from beginning, bidirectional/offset seek, rebuild, and recovery
- [ ] 7. Audio, subtitles, versions, advanced synchronization, and unsupported formats
- [ ] 8. Playlist/episode queues, drawer content, playing badge, and focus positioning
- [ ] 9. Up Next resolution/countdown/seek cancellation/re-arm and skip-prompt focus behavior
- [ ] 10. Chapters, Previous/Next, Back/Stop, and exact playback-origin restoration
- [ ] 11. Magic Remote hover, click, wheel, timeline, queue, and long-press behavior
- [ ] 12. LAN/internet loss and recovery across every active application view
- [ ] 13. User diagnostics, redaction, state accuracy, and polling teardown
- [ ] 14. Poster sizes, artwork/backdrop quality, overscan, languages, accessibility, and focus visibility

# Physical-TV release signoff: v<major>.<minor>.<patch>

- Date: <YYYY-MM-DD>
- TV model: <model>
- webOS version: <version>
- Tester: <name>
- Result: <PASS or FAIL>

## Regression matrix

Copy this file to `docs/release-signoff/v<major>.<minor>.<patch>.md`, replace
all placeholders, and check each item only after completing the corresponding
physical-TV test in `docs/testing.md`.

- [ ] 1. Home, search, libraries, collections, and playlists
- [ ] 2. Poster sizes, focus, wheel, overscan, and artwork resolution
- [ ] 3. Resume, bidirectional seek, tracks, and media versions
- [ ] 4. Auto, Direct only, Force transcode, and bounded retry
- [ ] 5. 1080p SDR and supported 4K HDR10 playback diagnostics
- [ ] 6. LAN disconnect and recovery across active views
- [ ] 7. Previous and Next across regular seasons
- [ ] 8. Resume, Play from beginning, Cancel, and Back
- [ ] 9. Advanced text-subtitle synchronization
- [ ] 10. Unsupported advanced image-subtitle formats
- [ ] 11. User diagnostics and polling cleanup
- [ ] 12. Chapters, progressive thumbnails, pointer, and repeated seeks
- [ ] 13. Every supported interface language
- [ ] 14. Virtual catalog sorting, filters, and recycled cards

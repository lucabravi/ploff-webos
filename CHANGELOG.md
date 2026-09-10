# Changelog

All notable changes to Ploff are documented in this file.

## [1.0.7] - 2026-09-11

### Added

- Player Media Details now exposes the complete playback recovery trace in a dedicated Diagnostics section immediately after Subtitles. The compact Player row may ellipsize long traces, while the clickable Media Details dialog preserves and wraps the full diagnostic string for TV-side recovery investigations.
- Added a manual Web Inspector debug capture for rare playback/subtitle desync investigations. The collector is shipped as an on-demand diagnostic asset rather than in the production startup bundle, starts only after explicit Web Inspector loading/`start()`, retains an unbounded privacy-filtered event stream until stopped, and correlates playback/source generations, buffering/recovery, seek/source replacement, native media events and ASS timing/presentation events without exporting source URLs, Plex tokens or subtitle text.

### Changed

- Player startup is now split into Core and one deferred `player.js` artifact. Core becomes available without reading or constructing Player implementation modules; a single callback-based readiness path warms Player after focusable Home or immediately on first playback intent. Enabled local ASS prewarm remains early and shares the same renderer pool. Playlist/collection entry, extras, cancellation, current identity ports, localized labels, partial-construction rollback, and release/freshness guards are covered by new regression tests. The initial development JavaScript payload decreases by about 21% and the complete flow has been validated on the target LG TV.
- New installations now default poster-card sizing to 90%; existing saved choices remain unchanged.
- Development checks share identical AST mechanics, parse each authored file once per feature-contract invocation, and report running-test durations with optional timeouts. Settings declarations now have compiler-backed schema parity; runtime settings defaults, storage, and migration behavior are unchanged.

- Phase 5 of the evidence-based cleanup splits the 4,619-line PlaybackController regression suite into core, subtitle/editor, and buffering/recovery suites and the 2,590-line PlayerFeatureController suite into presentation, queue, and settings domains, each backed by fixture-only shared harnesses. Automated name/order comparisons preserve all original 149 Playback and 87 Player named regressions exactly once. The final runtime dead-code sweep also removes the obsolete standalone `setup-server-session.js` path and stale optional `SetupController.serverSession` hook after proving the current Setup feature has no production provider for that compatibility layer. The smaller Detail feature suite remains intentionally unsplit because its boundaries do not justify duplicating/hiding event context merely to reduce line count.
- Phase 4 of the evidence-based cleanup completes the Plex/composition ownership audit without changing protocol behavior. Home-row and recommendation shaping live in the dedicated `PlexHomeModel`; `PlexClient` keeps XHR/cache/concurrency ownership and its reviewed facade is reduced to 36 exports, 35 with production consumers plus one intentionally test-visible recommendation-cache API. Test-only activity/account/navigation helpers are private and covered through production APIs. Settings backup now receives its four Plex playlist-persistence capabilities through `PlexFeaturePorts.settingsBackup()` instead of bypassing the reviewed feature-port boundary. Runtime-size/startup budgets remain measured guardrails rather than frozen historical counts: the cohesive Home owner intentionally moves development startup from 128 to 129 scripts while remaining inside current reviewed limits.
- Phase 1 of the evidence-based v1.0.7 code cleanup reduces Playback facade ownership without changing user-visible behavior. Local subtitle seek-presentation gating now belongs to `SubtitleRuntime`, `PlaybackController` only coordinates lifecycle/native-clock evidence, and `PlaybackReposition` remains the sole owner of bounded LG/webOS keyframe settlement. Four pure facade aliases were removed. The generated runtime bundle decreases from 899,972 to 899,704 raw bytes while all playback, subtitle, ES5, architecture, memory and LG UX gates remain green.
- Phase 2 of the evidence-based cleanup removes duplicated Player facade state and pure aliases without changing Player behavior. Queue-gap visibility is now read from the authoritative `QueueGapController` through an O(1) `isOpen()` query, resume-choice visibility is derived from nullable domain state, and five one-use pass-through wrappers were removed. `player-feature-controller.js` decreases from 2,850 to 2,841 lines and the generated runtime bundle from 899,704 to 899,156 raw bytes.

### Fixed

- Home no longer stays visually empty when Plex/NAS media arrive after an initially empty startup response. The hero now keeps its own reconciled media presentation independently from navbar focus, so the first available card supplies title, summary and backdrop even if navigation focus must remain on the navbar. When no Home interaction has occurred, the first late media card still receives the normal initial focus; deliberate navbar navigation is preserved.
- Remote OK now activates a visible standalone Skip Intro/Skip Credits prompt directly while Player controls are hidden or in compact timeline mode, instead of expanding the full control bar. Full-control focus priority is unchanged. Skip activation consumes the current marker immediately and preserves that suppression through the seek's bounded decoder/keyframe rollback, preventing the same prompt from flashing back after the skip.

- Settings backup restore no longer resumes onboarding, reapplies Settings, or starts read-dependent persistence work after its owner is destroyed. Restore application is once-only; user cancellation and same-/other-device import behavior are preserved. Already-started remote writes retain completion/rollback but suppress notifications to destroyed consumers. The existing Settings/persistence ownership boundary is retained and covered by focused lifecycle tests.

- Advanced Subtitle Settings seek preview now forwards ASS timeline discontinuities through the active editor-owned preview state. Opening the editor intentionally clears `SubtitleRuntime.localState` while retaining the renderer/content in `subtitleEditorState`; seek, decoder-settlement and buffer-repair discontinuities now target that active preview owner instead of becoming no-ops. This fixes long post-seek ASS stalls inside Advanced Settings while preserving the existing 50 ms preview clock and provisional-target hiding.
- Local ASS/SRT subtitle overlays are now gated across every committed seek, including seeks made while paused and fully buffered seeks with no `waiting`/`stalled` event. The overlay hides before the provisional target can render. A paused-origin seek stays hidden through the subsequent `playing` transition until a post-play decoder sample proves the real position; an already-playing seek likewise ignores a `timeupdate` still parked on the exact requested target. The gate opens when a bounded rollback has been adopted (for example 10:29 -> 10:23) or when the native clock demonstrably advances from the target without rollback. Rebuffer/rebuild still requires a fresh stable `playing` before release. This prevents the optimistic target subtitle from remaining visible while paused or flashing during a no-rebuffer seek.
- Detail episode cards now show partial Plex progress during a rewatch even when the episode remains `viewed=true` from a previous completion. The watched marker and progress bar are independent: the bar is visible only for current progress strictly between 0% and 100%, including rewatch offsets, and remains hidden at 0% or 100%.
- A seek during the very first playback startup now preserves autoplay intent even while webOS still reports the native element as paused. The controller distinguishes a technical pre-start pause (including an already-issued native `play()` that has not reached `playing` yet) from an explicit user pause, so seeking during initial buffering/source startup resumes automatically once the seek/reopen settles.
- Direct Play decoder settlement now invalidates local ASS at the decoded keyframe whenever a bounded post-seek rollback is accepted, including the case where webOS first reports the requested target in `seeked` and reveals the earlier keyframe only on a later `timeupdate`. The local ASS epoch, prepared frames, static bitmap and clock are therefore rebased to the adopted video time instead of leaving the subtitle from the optimistic pre-rollback target visible.
- Direct Play recovery is now sticky while native playback remains technically usable. Seek/rebuild, buffering and clock repair, terminal-window handling, seek timeout/mismatch, and DP-capable stream/track switching preserve Direct Play instead of consuming Direct Stream as a generic recovery step. A non-terminal Direct Play rebuild still gets one guarded internal cold reopen at the requested absolute position; any further rebuild while that reopen is settling retries the same Direct Play delivery and is recorded as `RETRY[...]`. Unclassified Direct Play native/prepare failures stop the bounded recovery on the current delivery instead of silently advancing to Direct Stream. Direct Stream fallback remains available for confirmed codec/decoder/format/container incompatibility (and when the normal capability plan already excludes Direct Play), while an already-selected Direct Stream/transcode stream retains the existing terminal lookback. Steady-state VOD Direct Stream seek rebuilds keep the internal reopen. The Player surface stays mounted, pause/play and media/track/quality preferences are preserved, a healthy local ASS/libass renderer remains warm, and the existing recovery diagnostics are retained.
- A rebuilt stream can no longer resume from an obsolete near-end target while a newer seek is still being coalesced. If the user keeps seeking during recovery, the delayed `resumeRebuiltStream()` callback stays paused until the pending seek commits; the existing debounce then rebuilds once for the latest target instead of briefly playing the superseded source and exposing its stale `offsetBase` to video/subtitle timing.
- A Direct Play seek immediately after buffering now gives the existing `PlaybackReposition` keyframe-settlement policy a chance to adopt the decoder position before requesting bounded same-delivery recovery. A bounded rollback such as the reproduced `872.100 -> 862.502` webOS seek result therefore keeps Direct Play, rebases timeline and local ASS to the frame actually being decoded, and opens a fresh ASS discontinuity at that decoded position; rollbacks outside the existing 15-second policy rebuild Direct Play normally rather than treating Direct Stream as the next seek-recovery tier.
- Player Settings no longer duplicates the local/remote subtitle-renderer ownership label under the subtitle track. The compact renderer pill in the Player remains the single ownership indicator.
- First-run local Plex discovery now gives the GDM service its own 5-second response window instead of inheriting the shorter 1.8-second HTTP-probe timeout.
- Watched and progress state now reconciles consistently between Player, Detail and Home after Plex confirms completion, without introducing a local completion threshold.

### Added

- The compact Player track summary now shows a localized pill below the active subtitle when local subtitle rendering is actually in use, identifying `SRT / WebVTT` or `ASS / SSA`. The badge follows runtime ownership rather than the global preference, so server/native rendering, Force Transcode, loading, and subtitles-off states do not advertise a local renderer.
- Home rows can now be hidden and reordered from one **Home item ordering** setting (localized as
  **Ordinamento elementi home** in Italian). The ordered
  preference controls Continue Watching, Recommended, and Recently Added as groups while
  preserving Plex order within repeated Recently Added rows.
- Detail media options can now mark all episodes before the selected episode as watched.
  The action confirms first, reloads the selected season from Plex, matches the selected
  episode by rating key, skips episodes already watched, never touches the selected/later
  episodes, and retains partial-failure reporting.
- Media Detail now exposes a remote-first lower pane for genres, directors, cast,
  trailers, and extras. Down enters it without an activation key; cast rendering
  and artwork are bounded/lazy, while Plex extras are fetched only on first entry
  and do not block remote focus.
- Release artifacts now include an SPDX JSON SBOM generated from the inspected IPK payload and GitHub artifact attestations for IPK provenance/SBOM and the published container digest; build and security-scan container references are immutable digest-pinned.
- TV accessibility/performance preferences now include global UI text scaling at 90%, 100%, 115%, and 130% without resizing poster/card geometry, plus **Lightweight image loading**. Lightweight loading is shown above the poster/backdrop quality controls, caps their selectable/persisted maxima at 80%/70%, keeps lower choices available, and reduces progressive image concurrency without applying a second hidden resolution multiplier. The existing interface-animation switch remains the reduced-motion control.
- Optional local rendering for text subtitles (SRT/WebVTT and ASS/SSA) over Direct
  Play, with per-media and per-season timing and size preferences. Plex's normal
  subtitle path remains the default, and image subtitles stay on that path.
- Added an optional stronger “Double outline + shadow” subtitle edge for readable
  local text subtitles and their live preview.
- Subtitle scaling now extends the existing 75/100/125/150% choices with 175% and 200%, using the same bounded domain in global Settings, the Player selector, and Advanced Subtitle Settings.

### Fixed

- Buffering can no longer publish an impossible webOS `currentTime` jump into the shared Player/ASS clock. `waiting`/`stalled` now capture and freeze the last confirmed public/native/offset checkpoint immediately while the spinner retains its 500 ms visual grace; a playing `timeupdate` below native `HAVE_FUTURE_DATA` opens the same defensive checkpoint when webOS delays or omits those events. `canplay` alone cannot release it; `playing`, the native-advance watchdog, or a validated high-readiness `timeupdate` after pause/resume can complete recovery even when webOS omits the second `playing` event. A transient bad sample gets 400 ms to settle, while a persistent backward/forward/offset-domain inconsistency rebuilds at the checkpoint once. A small accepted decoder rollback opens a new local-ASS epoch before adoption, and a persistent clock-repair rebuild opens another epoch at its normalized checkpoint, so static/prepared barriers cannot remain ahead of the video or survive a rejected source. Repair is bounded once per incident but re-arms for later buffering or an explicit seek, pause preserves the checkpoint, seek supersedes it, and terminal/error/source-close paths cancel stale settlement work. Privacy-safe diagnostics now expose raw native, derived absolute, checkpoint, decision reason/delta, and cumulative repair count without URLs, tokens, or subtitle content.
- Plex failure paths are now reconciled instead of being reported as success: watched/unwatched plus resume reset exposes partial success so the UI reflects the watched state Plex already accepted without falsely clearing progress; initial playback fails cleanly if Plex rejects stream selection; timeline callbacks report persistence only after a successful write; library/metadata refresh calls return their abortable request handles; failed first-time settings-backup summary writes remove the just-created technical playlist before retry; and sub-hour episode durations are consistently zero-padded as `MM:SS`.
- The compact Player local-subtitle renderer pill now keeps 6 px of breathing room below the subtitle summary while preserving the existing 20 px summary typography and Player overlay geometry.
- Chapter cards now keep a neutral theme-aware preview surface at 70% opacity when Plex exposes no chapter thumbnail or an image request fails, so webOS never shows the browser broken-image glyph. Episode previews in Detail and the Player queue now show a bottom-left duration badge using `MM:SS` or `H:MM:SS` (hours unpadded) and `--:--` when duration is missing/non-positive, without moving the watched marker. Detail episode artwork now recovers the 44 px previously reserved from the image: previews are 168 px tall while the 44 px caption remains below, and the bottom-anchored strip grows upward by the same 44 px so the overall Detail layout does not drift down. The duration badge sits 6 px above the artwork edge, while the 6 px playback-progress bar now starts immediately below the artwork and consumes caption space instead of crowding the duration badge.
- Media watch/progress actions now distinguish untouched, partially watched, and completed movies/episodes consistently across card long-press and Detail menus. Partial cards expose both **Mark watched** and **Mark unwatched**; on a partial Detail the `...` menu places the watched action complementary to the visible main button first (for example **Mark watched** when the main button is **Mark unwatched**). Clear-progress now sends Plex a stopped `time=-1` beginning sentinel instead of the ineffective `time=0`, while Continue Watching removal remains origin-specific.
- Static local ASS no longer leaves the currently displayed subtitle stuck after a committed seek that
  lands outside that rendered state's exact validity window. The already-presented bitmap is retained
  only when the target remains inside `[validFrom, validUntil)`, avoiding both stale subtitles after
  forward/backward seeks and unnecessary flicker for seeks that stay within the same static state.
- Static ASS lookahead now retains up to five memory-bearing prepared states, while zero-byte canvas
  states remain free and the existing 16 MiB RGBA budget stays authoritative. Home-time libass warmup
  is also reduced to the single glyph-bearing render proven useful by physical-TV measurements.

- Prepared ASS lookahead no longer coerces a missing render-time override to media time zero. Live
  static/animated renders now use the extrapolated playback clock unless a numeric speculative
  boundary time is explicitly supplied; a real legacy-worker regression covers replacement tracks
  whose first event starts well after 0:00, matching resume/mid-episode playback on LG webOS.
- Library watched filtering now keeps Plex membership and card presentation aligned across Detail,
  Player, cached Library surfaces, and playlist/collection summaries. Shows and seasons render the
  watched badge only when all leaves are watched; the Unwatched catalog also applies that canonical
  metadata check locally, so Plex rows such as a `13/13` fully-viewed show are rejected even if Plex
  incorrectly returns them for `unwatched=1`. Raw Plex offsets remain authoritative across local
  rejections, all-rejected intermediate pages automatically advance to the next raw page, and each
  visible catalog card retains its raw source offset for bounded reconciliation. Watched-state
  mutations immediately remove cards that no longer belong to the active Watched/Unwatched catalog,
  invalidate pre-mutation requests, retry failed authoritative refreshes, re-probe Continue
  availability after playback changes, and prevent incremental pagination from using stale offsets.
  Returning from Detail/Player reconciles a regular catalog with one bounded 60-item Plex window
  around the prior focused raw source offset, preserving the resident prefix and reselecting the same
  `ratingKey` when it still belongs to the result (otherwise the prior numeric position), instead of
  replaying every loaded page from offset zero.
- Empty and filtered Home states now remain remote-safe and self-explanatory: hidden-row
  guidance is restored when returning to Home, enabled rows with no current content point
  back to Home-row Settings without polling flicker, Back navigation works without media
  cards, and Home-ready warm-up hooks rearm after a server/profile content reset.
- Home-row preference hardening now reapplies the latest cached Home source after Settings changes, preserves local watched projections and current-language labels, correctly clears an intentionally empty Home, keeps focus on the navbar, and shows passive guidance when every configurable row is hidden without letting background polling replace it.
- Season watched bulk actions no longer let completion from an older season or Detail session overwrite a newer selection, keep newer bulk locks intact when stale callbacks arrive, and always clear pending/disabled state when Detail is left or reopened.
- Predictive browsing lifecycle now drops deferred Watchlist warm-up after leaving Home, cancels stale episode metadata when season intent changes, keeps the latest selected season authoritative while focus moves, and remounts bounded Watchlist rows during page scrolling.
- The DB8 credential vault now updates known records by `_id`, selects the newest surviving duplicate by `_rev`, and performs duplicate cleanup as best effort, so a failed legacy delete cannot make an older token win after restart.
- Release update comparison now follows SemVer 2.0 prerelease precedence while retaining the previous numeric fallback for non-SemVer development/version strings.
- Applying or cancelling Advanced Subtitle Settings now restores the captured
  editor-open position without misclassifying a safe local SRT/WebVTT reposition as
  playback failure. Verified local overlays reuse the existing native seek path and
  bounded Direct Play decoder settlement, avoiding unnecessary source replacement
  or Direct Play -> Direct Stream fallback while keeping video, timer and subtitles
  aligned to the keyframe webOS actually decodes.
- Advanced Subtitle Settings now supports embedded ASS/SSA for playback timing and applicable local
  controls without treating Plex's converted payload as an editable original document. Controls are
  capability-gated from the selected track and actual pixel owner: offset/loop/timeline remain
  available for supported tracks, size requires local rendering, SRT background/edge require the
  local text renderer, and ASS appearance stays owned by libass. Force Transcode can therefore adjust
  embedded ASS timing through Plex while preserving the same per-server/part/stream offset for a
  later local-renderer session. Disabled controls are skipped by D-pad/pointer input and never
  overwrite applicable scoped presentation values; Apply to season promotes only enabled fields and
  preserves disabled local-only media values for a future renderer-ownership change.
- External ASS/SSA subtitle tracks remain available in Advanced Subtitle Settings after a transient
  local renderer/text-load failure, allowing the editor to retry JavascriptSubtitlesOctopus without
  weakening the existing SRT/WebVTT failure guard or the Force Transcode burn-in path.

### Changed

- The compact Player local-renderer pill now inherits the same font size, normal weight, and line-height as the Audio/Subtitles summary rows while keeping its existing border and pill geometry.
- Legacy ASS startup now performs a one-shot synthetic glyph render on the already-preloaded worker
  immediately after the first Home surface becomes usable, moving the reproducible ~7-second cold
  libass glyph/raster cost out of first subtitle playback when Home idle time is available. Immediate
  playback can still claim the same single worker and cancels remaining warm work. Static prepared
  lookahead now limits only memory-bearing RGBA states to five: zero-byte/empty-canvas boundary states
  stay ordered in the queue without consuming that quota, allowing deeper useful states to be prepared
  while the existing 16 MiB retained-RGBA budget remains authoritative. Diagnostics expose total and
  costly prepared depth separately.
- The Chrome 53 ASS/SSA Legacy worker now ships a Ploff-specific JavaScript profile: deprecated manual `.br` subtitle decoding, unused lazy/external font discovery, lossy/wasm-blend renderers, benchmark/event-editing APIs, unused style-edit bindings except Ploff's `FontSize` read/write path, and other unused JS bindings are removed while `js-blend` rendering remains unchanged. Its 654,399-byte Emscripten static-memory image is also externalized byte-for-byte into a binary `.mem` asset instead of 2,378 base64 JavaScript fragments, reducing parseable worker JavaScript from 3,412,826 to 2,381,374 bytes (30.2%) without changing libass/FreeType/fontconfig data or rendering semantics. The source archive, generator, synchronization/static-memory checks, and real render smoke test with the packaged WOFF2 fallback font make the transformation reproducible.
- When global ASS/SSA on-device rendering is enabled, legacy non-WebAssembly TVs preload the single
  JavascriptSubtitlesOctopus worker from the document head, then perform one measured glyph-bearing
  warm render after Home becomes usable. With the global ASS setting disabled, startup worker creation,
  Home warmup, ASS pool prewarm and speculative ASS prefetch are all skipped. The same worker is
  transferred to foreground playback without creating a second libass instance. Detail reuses the
  first Plex metadata response to identify/fetch external ASS earlier, the real track can be prepared
  on the warm worker before Play, packaged-font bootstrap and `js-blend` conversion are optimized,
  and bounded privacy-safe phase telemetry reports real cold-start durations. WebAssembly-capable
  browsers keep the existing path.
- Browsing background work now warms likely next destinations without competing with
  the active TV surface: Watchlist keeps a bounded mounted card window and warms only
  after Home is usable, adjacent Library prefetch stays data-only until navigation
  intent, deeper Home artwork is promoted ahead of focus, Home refresh presentation
  waits for a brief input quiet period, and superseded Detail previews abort stale
  Plex requests.
- Player subtitle timing/style/track preferences remain scoped: current-media overrides inherit from season defaults and then global Settings, while renderer ownership is now strictly global. Advanced Subtitle Settings keeps SRT/WebVTT and ASS/SSA renderer controls as global shortcuts: every enable/disable action uses a two-choice confirmation with No as the safe default, old scoped `renderSrt`/`renderAss` values are ignored, and media/season backups no longer serialize those renderer flags. Cancel reverts draft presentation changes but never rolls back a confirmed global renderer change. Apply to season still stores one sparse season profile with stable track matching, and Reset media/season stays draft-only until Apply.
- Production IPK staging now collapses the 122 core startup modules into one ordered ES5 `core.js` while keeping source `app/index.html` modular for development and keeping ASS/SSA worker/runtime assets separate from the core bundle. The legacy worker may still be initialized from the document head when global local ASS/SSA rendering is enabled; with ASS rendering disabled, startup worker/prewarm is skipped. The measured core startup surface falls from 124 local scripts to 3 and from 442,611 to 367,667 aggregate gzip bytes.
- Player and Settings key precedence now routes through the pure `InputCommandRouter`, while feature controllers retain the side effects and domain-owner calls.
- Maintainability hardening now has a deterministic verification gate for Playback-owned
  subtitle eligibility, native-video ownership, and reviewed input-routing trend budgets;
  the final audit also records clean type checking and the reduced Player/Plex/hotspot
  surfaces.
- Plex transport boundaries are narrower: Player and Media Context now receive explicit feature ports instead of the complete Plex client, while pure Plex media-document traversal and card/detail/container mapping live in focused modules behind the existing compatibility facade.
- JavaScript type checking is now clean for the full application and contract configurations; dynamic diagnostics snapshots, Plex XML attribute maps, and support-report payload builders now carry explicit JSDoc boundary types without changing runtime behavior.

## [1.0.6] - 2026-08-16

### Added

- An integrated Detail media-version browser: Version stays first and always opens
  technical file/video/audio/subtitle information, supports non-destructive preview
  across multiple files, and keeps explicit D-pad-reachable Cancel/Apply actions.
- Contextual Detail media options with confirmed whole-season watched/unwatched
  mutations, sequential best-effort updates, fresh season reload, partial-failure
  reporting, and metadata refresh.
- Three additional visual themes built as isolated Chrome 53/webOS designs:
  `premiere` (premium cinematic), `nova` (futuristic tech), and `atelier`
  (minimal luxury), each with theme-specific Home, browsing, Settings, Detail,
  Player, focus, and motion treatments.
- A unified local `release:package` command that rebuilds generated assets, runs the pre-release gate, packages and inspects the IPK, and writes SHA-256 checksums without mutating Git or version metadata.
- Versioned fixtures for local Settings, saved-settings backup payloads, and playback compatibility memory, including non-destructive recovery of legacy split v2 saved-settings playlists.
- Diagnostics support export now keeps the QR mail draft while also showing the same privacy-safe report text as a legacy-TV-friendly fallback.
- Contextual media actions opened by long-press OK or the Magic Remote center button, with dynamic watched/unwatched, clear-progress, play-from-beginning, and Continue Watching removal choices for movies and episodes.
- Detail media options now preserve whether a movie or episode was opened from
  Continue Watching, exposing the same removal action with Plex refresh, toast
  feedback, and immediate action cleanup after success.
- TV calibration controls with independent safe-area insets and a live edge/center preview.
- Subtitle appearance controls for background, vertical position, and text edge, with a live in-settings preview driven by the same presentation variables used by playback.
- Optional high-contrast and stronger-focus presentation modes for TV viewing.
- Independent poster/thumbnail and backdrop download-quality controls. Poster
  artwork uses 70%, 80%, 85%, 90%, and 100% steps with a 90% default; backdrops
  use 50%, 60%, 70%, 85%, and 100% with an 85% default. These settings change
  Plex request resolution without changing on-screen element geometry.
- Origin-aware paginated playback sequences for Series, Playlist, and Collection
  origins, with bounded metadata and artwork retention, duplicate-safe occurrence
  identity, a virtualized queue drawer, and confirmation before crossing missing
  season or episode ranges.
- A pre-release memory lifecycle gate that repeatedly creates and destroys caches,
  dialogs, queue state, cancellable Plex requests, timers, and progressive-image
  jobs while checking deterministic teardown, `WeakRef` collection, and heap
  stabilization.
- Local Plex discovery through the packaged Luna service, restoring multicast GDM
  discovery on webOS while preserving manual server entry.
- Lazy, non-blocking update checks after the first successful Home load, with a
  clickable application-version row, manual refresh, release status, and QR link.
- Privacy-safe support reports now include allow-listed Settings and adaptive-playback
  compatibility schema/context summaries without exposing Plex tokens, credentials, server URLs,
  or local addresses.
- Explicit visible Cancel, Close, or Back actions for persistent dialogs that
  previously depended only on the remote Back key.
- Library-origin badges on mixed Home rows, Search, Watchlist, and playlist content.
- Watched-state and live Play/Pause markers in the playback queue.
- An exhausted-queue countdown that returns to Home or leaves the final frame paused
  when cancelled.

### Changed

- Accent-color Settings now sit directly below the visual theme, show the selected
  color swatch in the main list, and are visible only for Simple and Cinema;
  Premiere, Nova, and Atelier keep their theme-owned palettes while preserving the
  saved global accent for later theme switches.
- Home hero copy now uses the available horizontal gutter width instead of narrow
  percentage/max-width caps, reducing unnecessary title truncation across the shipped
  theme layouts while preserving each theme's visual treatment.
- Repository documentation was consolidated around current references: completed implementation plans and intermediate benchmark logs were removed from the working tree, the roadmap now contains only open work, and README and contributor guidance now provide clearer architecture and installation onboarding.
- Settings UI choice rows now consume bounded domain values directly from `settings-schema.js`; the catalog owns labels and presentation only.
- Application composition regression coverage now freezes server-switch, account reset/disconnect, and shared playback-identity lifecycle boundaries.
- Persisted Settings definitions are centralized in `settings-schema.js`, while the existing
  Settings catalog remains presentation-only; defaults and bounded choices now have one
  persistence authority without changing existing migration semantics.
- Release metadata now fails verification when `package.json`, `package-lock.json`, and
  `webos-shell-app/appinfo.json` drift, and tagged releases reuse the same canonical checker.
- Settings categories and rows were reordered into a clearer TV-first hierarchy, with Accessibility immediately after Interface and background theme audio grouped under Audio & themes.
- Adaptive playback compatibility fingerprints now include video bit depth and the actually selected audio/subtitle technical characteristics; file-specific exceptions also distinguish exact selected stream IDs.
- Playback compatibility storage moved to schema v3 with bounded TV/runtime/application metadata, explicit observation/derived/user-override provenance, and migration from v2.
- Application settings storage moved to schema v3 with explicit sequential migration from v1/v2 persisted records, including legacy video-quality, autoplay, and removed sync semantics.
- Replaced the temporary suboptimal terminal-transcode workaround with a bounded
  Direct Stream lookback and a verified native seek on the same absolute Plex
  clock. Requests within the final five seconds now jump to the actual native
  end and pause there, while ordinary Direct Play and Direct Stream playback
  keep their selected delivery mode.
- Ordered application settings now render as accessible stepped bars with the
  active value shown beside the track; LAN and remote video quality increase
  from 4 Mbps through 12 Mbps to Original at the rightmost step.
- Related settings, selectors, dialogs, filters, setup surfaces, and Player panels
  share action surfaces, focus rings, panel tokens, disabled states, and consistent
  secondary-left / primary-right action ordering.
- Ordinary pointer clicks now synchronize focus and use the same semantic OK path as
  the physical remote; timeline coordinates, navbar long-press, and other truly
  pointer-specific interactions keep dedicated handling.
- Main navigation Back now rises one visible level at a time through content, filters,
  sub-navigation, the current navbar item, and finally Home.
- Playback queues open on the current item but allow navigation to earlier episodes or
  earlier playlist/collection occurrences.
- Player settings focus the first available action on open and temporarily hide active
  Skip prompts without discarding them.
- Runtime bundle guardrails are documented as adjustable engineering alarms rather
  than webOS platform limits.
- Player return restoration now reloads the authoritative Plex origin for Series,
  Playlist, and Collection detail views and restores the exact played occurrence.
- Playlist and Collection detail share one presentation contract, while long
  containers and episodic queues load only bounded pages or season segments.
- The generated ES5 coordinator bundle is deterministically token-minified and
  verified through normalized AST equivalence.
- Plex pagination, media-document parsing, track normalization, cancellable HTTP
  transport, media choices, technical labels, search normalization, and server
  identity matching now use focused shared domain modules instead of duplicated
  implementations.
- Player terminology was reviewed across all eight locales, and unused translation
  keys were removed while preserving key and placeholder parity.
- The full Library catalog now uses focus-only updates, frame-scheduled scrolling,
  incremental keyed row reconciliation, in-place page append, and tiered artwork
  promotion while retaining the existing three-row overscan.
- Card geometry, fixed artwork dimensions, mounted-node lookup, bounded card
  presentation, and Search measurements now reuse explicitly invalidated caches instead
  of recalculating static layout data during navigation and scrolling.

### Fixed

- Concurrent, stale, malformed, aborted, or terminal Plex pages can no longer
  expand a known queue boundary, leave phantom items, or poison a later retry.
- Rapid Player selections and superseded playback preparation now preserve the
  latest user choice and abort obsolete metadata, decision, and stream work.
- Library and Recently Added pagination preserve raw Plex offsets and merge groups
  correctly when one season spans page boundaries.
- Home, dialog, Player, Up Next, queue-gap, progressive-image, and XHR lifecycle
  paths release timers, callbacks, handlers, and retained target bindings during
  replacement or teardown.
- Rapid navbar movement can no longer leave the highlighted navigation item and
  visible page out of sync when focus enters the content.
- Pointer hover no longer rebuilds settings, setup, choice, language, server, resume,
  or Library-filter controls before their click completes.
- Watchlist, Library, recommendations, theme audio, credentials, server probes,
  metadata refresh, cloud Search ordering, update checks, and local-storage failure
  paths reject stale work and remain bounded or non-blocking across profile, server,
  network, and lifecycle changes.

## [1.0.4] - 2026-07-25

### Added

- Private, app-owned webOS DB8 storage for Plex account and Plex Home
  credentials, including automatic migration from legacy browser storage and a
  session-only fallback when private storage is unavailable.
- A privacy policy, in-app privacy information, and a complete local-data
  deletion action covering credentials, servers, preferences, subtitle
  offsets, navigation state, and the local client identifier.
- Network awareness backed by the official webOS API, with LAN, Internet, and
  local-only diagnostics, visible connection state, offline-safe local
  operation, and recovery when connectivity returns.
- A playback queue for playlists, series, seasons, collections, and mixed
  media playlists. The player exposes the queue without leaving playback and
  preserves Plex playlist ordering.
- A compact server-activity indicator in the navigation bar, including a
  Chrome 53-compatible animated state for legacy LG webOS TVs.
- Automatic playback-version ranking by resolution, HDR, estimated quality,
  and Direct Play compatibility, plus version affinity across adjacent
  episodes.
- Native TV locale detection for the initial onboarding language and
  background Plex discovery while the language is being selected.
- A TV-readable technical media-information dialog for the active file,
  available from media details and player settings without exposing full
  filesystem paths or raw Plex XML.
- LG Content Store preparation documents, static UX compliance checks,
  dependency auditing and update automation, plus a physical-TV release
  signoff gate.

### Changed

- Repository documentation was consolidated around current references: completed implementation plans and intermediate benchmark logs were removed from the working tree, the roadmap now contains only open work, and README/agent/archive guidance now provide clearer architecture and installation onboarding.
- Playback queues now continue through mixed item types in Plex's original
  order, while automatic version selection favors the best compatible source
  according to the user's preferences.
- Advanced subtitle controls use a compact, remote-friendly layout with modal
  selectors, live text-subtitle preview, delayed size application, loop-aware
  preview restarts, and clearer Apply and Cancel actions.
- Media detail pages use more consistent spacing, progressive artwork,
  non-flashing metadata transitions, readable summaries, and resilient
  backdrop loading.
- Library navigation, recommendation rows, recycled cards, empty states, and
  progressive images preserve focus and visual state more consistently.
- HDR priorities automatically adapt to detected TV capabilities and expose
  their availability in diagnostics and settings.
- Onboarding preserves discovery work across language navigation and avoids
  unnecessary repeated scans.
- Continuous integration now validates pull requests from Dependabot without
  granting elevated GitHub token permissions; release packaging uses refreshed
  pinned GitHub and Docker actions.

### Fixed

- Playlist queue navigation and the server-activity indicator retain their
  intended position and layout on legacy webOS, even when activity labels are
  visible or the navigation bar is crowded.
- Final playback progress is sent before leaving the player and protected from
  an immediately stale Plex response, so Resume uses the latest confirmed
  position after returning to media details.
- Direct Play, seek, chapter, buffering, and subtitle-preview recovery no
  longer leave stale loading indicators or mismatched presentation state in
  the covered regression cases.
- Interrupted progressive artwork requests can be retried instead of leaving a
  backdrop permanently unavailable.
- Offline state no longer disables reachable LAN Plex servers or triggers
  avoidable cloud requests.
- Setup no longer gets stuck after returning from language selection, and an
  unavailable network state is presented as informational rather than as a
  blocking failure.
- The media-information modules are imported through the browser namespace,
  preventing the packaged TV app from remaining indefinitely on its startup
  screen.

### Compatibility Notes

- Existing credentials are migrated on first launch. If private DB8 cannot be
  used, credentials remain available only for the current session and are not
  persisted in plaintext browser storage.
- Runtime compatibility remains Chrome 53 / legacy LG webOS; no framework or
  runtime dependency was added to the installed application.
- A public `v1.0.4` tag additionally requires the completed physical-TV
  regression signoff documented in `docs/testing.md`.

## [1.0.3] - 2026-07-22

### Added

- Reusable choice dialogs for media tracks, playback options, and application
  settings, with remote and LG Magic Remote pointer support.
- Full technical labels for audio and subtitle tracks, including Plex-provided
  names, codecs, channel layouts, and external-track information.
- Exact per-media track preferences so multiple tracks in the same language
  remain selectable and can be restored independently.
- A global preference for automatic selection of external or embedded
  subtitles, defaulting to external subtitles.
- A watched-state selector inside advanced library filters, synchronized with
  the quick All, Unwatched, and Watched controls.
- Optional classic T9 search input for numeric remotes, enabled by default for
  new installations.
- User diagnostics, improved setup status, and independently testable views for
  onboarding, server selection, settings, search, libraries, Watchlist,
  details, chapters, and player controls.
- ESLint, JavaScript type checking, generated-bundle validation, dependency
  auditing support, and a unified local/CI verification command.
- A local preview script and responsibility-based source fragments that build
  the Chrome 53-compatible TV bundle.
- A README screenshot gallery generated from the real interface with a fully
  fictional demo library and profile.

### Changed

- Repository documentation was consolidated around current references: completed implementation plans and intermediate benchmark logs were removed from the working tree, the roadmap now contains only open work, and README/agent/archive guidance now provide clearer architecture and installation onboarding.
- Interface-language choices now display every language using its native name.
- Accent-color selection keeps the inline palette and also provides a labeled
  modal with color swatches.
- Application settings use one catalog as the source for both lateral cycling
  and modal selection, preventing the two interaction modes from diverging.
- Automatic subtitles prefer the configured source type while preserving the
  user's language priority and forced-subtitle rules.
- Theme preview delay now defaults to 500 ms for new installations.
- Episode cards use one caption format across Home, libraries, search, and
  playlists.
- Movie, series, season, and episode labels use shared formatters, including
  localized singular and plural season counts.
- The coordinator is maintained as focused ES5 source fragments and generated
  into a single dependency-free runtime bundle for legacy webOS.
- CI and release verification now run linting, type checks, unit tests,
  compatibility checks, asset validation, and repository hygiene checks.

### Fixed

- Local Plex playlists are parsed and displayed consistently outside library
  navigation.
- Transient `waiting` and `stalled` events no longer leave a buffering spinner
  visible while playback is progressing normally.
- Expired or interrupted Plex sign-in attempts recover without leaving setup in
  a permanent loading state.
- Recycled library cards retain the correct identity, artwork, captions,
  progress, and focus while virtualized grids move.
- Stale asynchronous results are rejected across search, setup, libraries,
  Watchlist, diagnostics, and progressive image loading.
- Main settings, player settings, and detail selectors restore focus correctly
  after a choice dialog closes or is cancelled.
- Direct Play seeking follows the native browser `seekable` ranges instead of
  requiring data to be pre-buffered, while validating that webOS reached the
  requested position.
- Failed native seeks and decoder clock regressions rebuild once from the last
  confirmed absolute position, preventing first-frame/timeline mismatches,
  repeated corrective-seek loops, and permanent loading indicators.
- Direct Play recovery moves to an offset-capable Direct Stream before any
  transcoding fallback, preserving copied video and audio whenever possible.

### Compatibility Notes

- Existing global settings remain valid. New defaults apply only when a value
  has not previously been saved.
- Per-media language-only track overrides from development builds are replaced
  by exact track signatures; affected media fall back to automatic selection
  until a track is chosen again.
- Runtime compatibility remains Chrome 53 / legacy LG webOS with no framework
  or runtime dependency added to the installed application.

## [1.0.2] - 2026-07-21

### Added

- Complete Japanese and Korean interface localizations.

## [1.0.1] - 2026-07-21

### Added

- Expanded Home, library, search, detail, player, chapter, subtitle, onboarding,
  remote-control, and Plex server-management capabilities.

[1.0.4]: https://github.com/lucabravi/ploff-webos/compare/v1.0.3...v1.0.4
[1.0.5]: https://github.com/lucabravi/ploff-webos/compare/v1.0.4...v1.0.5
[1.0.6]: https://github.com/lucabravi/ploff-webos/compare/v1.0.5...v1.0.6
[1.0.7]: https://github.com/lucabravi/ploff-webos/compare/v1.0.6...v1.0.7
[1.0.3]: https://github.com/lucabravi/ploff-webos/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/lucabravi/ploff-webos/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/lucabravi/ploff-webos/compare/v1.0.0...v1.0.1

[Unreleased]: https://github.com/lucabravi/ploff-webos/compare/v1.0.7...HEAD

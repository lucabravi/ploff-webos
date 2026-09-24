> **Archived historical record.** This document describes a completed or superseded implementation phase. Do not use it as the current behavior reference; see `docs/README.md`.

# Performance smoothing progress

Baseline supplied by user: `ploff-webos-develop-c317780-keyboard-shift-t9-2026-09-12.zip`

Git baseline:
- branch: `develop`
- HEAD at start: `c317780`
- pre-existing dirty working tree: preserved as supplied; these changes are not part of this performance work

Goal: keep Library, card, Watchlist, backdrop, theme and artwork navigation fast and fluid on legacy LG webOS/Chrome 53 without reducing quality or changing visible behavior.

## Work items

- [x] Baseline verification and hot-path inventory
- [x] 1. Library/navbar: avoid unnecessary rebuild/measure work during focus-only movement
- [x] 2. Watchlist: coalesce scroll-driven virtual-window updates with `requestAnimationFrame`
- [x] 3. Theme audio: avoid redundant synchronous `pause()` / reset work during rapid focus changes
- [x] 4. Backdrop: cancel/ignore stale pending loads as early as possible without visual differences
- [x] 5. Progressive artwork: keep full-quality output while deprioritizing heavy full-resolution work during rapid navigation
- [x] Cross-surface regression/stress tests
- [x] `npm run verify`
- [x] `npm run test:memory`
- [x] `git diff --check`
- [x] Final Git checkpoint and ZIP with `.git`

## Findings / decisions

- Preserve all pre-existing keyboard/T9 changes from the supplied ZIP.
- Do not reduce artwork resolution, disable theme effects, or change layout/animation timing for appearance reasons.
- Performance changes must remain ES5-compatible and bounded by tests; no budget increases solely to make regressions pass.

## Progress log

- Started audit from user-supplied baseline; progress file created before implementation.
- Baseline `npm run verify`: PASS. `node_modules` ZIP had flattened `.bin` symlinks; repaired only in local test environment, repository unchanged.
- Baseline already contains the prior edge-safe focus optimizations (`dbf91cb`) plus newer keyboard/T9 work from the supplied dirty tree.
- Navbar fast-path implemented: focus-only movement reuses the existing DOM and measured library window when structure + viewport are unchanged; theme/layout/window changes automatically fall back to the full measured render. Focus-only regression test verifies zero button recreation and zero extra button geometry reads.
- Watchlist scroll virtualization now coalesces rapid scroll events into one `requestAnimationFrame` (or timeout fallback). The callback reads the latest scroll position; pending work is cancelled on leave/reset. Regression test verifies no synchronous virtual-window rebuild inside the scroll event.
- Background theme audio `stop()` is now idempotent once audio is already stopped. Rapid focus changes keep the same stop/play semantics but no longer repeat `pause()`/seek work on the media element.
- Backdrop rescheduling now cancels stale work immediately on the inactive double-buffer image while preserving the active visible backdrop and any full-quality upgrade in progress. The existing generation guard remains the final stale-result protection.
- Progressive artwork now has a bounded 120 ms navigation idle window for starting new full-resolution jobs. Preview artwork still starts immediately, active full-resolution downloads are never cancelled, and queued full work resumes by priority at the exact original dimensions after input settles. Repeated navigation resets one timer rather than accumulating timers. Home/Search/Watchlist focus signals only from the actually focused card; Library and Watchlist scroll signal once per scheduled frame.
- Cross-surface stress checks: 200 navbar focus moves reuse stable DOM with zero additional geometry reads; 200 repeated theme stops do not repeat media pause; 100 backdrop reschedules cancel only the inactive buffer; Watchlist scroll bursts coalesce into one frame; 200 artwork deferrals retain one idle timer. Full unit suite passes after canonical `build:app`.
- Library benchmark remains bounded at 5,000 and 10,000 items. At 10,000 items the 5,000-move focus run remains ~10 ms in Node with zero DOM mutations/query selectors and the four conservative geometry reads retained for edge-safe focus visibility.
- Full `npm run verify` passes on the integrated user baseline. Memory lifecycle passes with 0/200 weakly retained payloads, 0/100 runtime payloads and ~0.06 MiB net heap growth. `git diff --check` is clean.

## Continued audit after checkpoint 0423a57e

- Watchlist focus hot path: same-window grid-to-grid movement now clears only the previously tracked mounted card instead of invoking the global `.is-focused` scan. The fast path is deliberately restricted to a still-mounted grid target; navbar transitions, DOM remounts and other ambiguous cases retain the global clear fallback. Existing rebuilt-navbar regression coverage remains green.
- Search virtual-window boundary: retained mounted cards now reuse their existing poster specification/load state. Crossing one virtual row builds poster specs only for newly mounted cards; retained cards are reprioritized directly when needed. Regression coverage verifies two new specs for a two-column row instead of rebuilding all mounted poster specs.
- Home/navbar focus: stable navigation focus now resolves through the existing `navigationButtonsByIndex` map instead of a document-wide `querySelector`; missing/rebuilt DOM automatically falls back to the normal measured navigation render and selector path.
- Theme metadata: an in-flight stale metadata request is aborted as soon as focus schedules a different theme, and active metadata work is also aborted on shell destroy. Regression tests cover both focus churn and teardown.
- Home predictive artwork: adjacent-row reprioritization now walks the existing `homeCardTargets` map instead of querying the DOM for every card in the neighboring row. The focused-card path and priority tiers are unchanged.
- Library grid focus: removed duplicate controller-level global focus clearing and duplicate document lookup/poster reprioritization. `LibraryGridView.refreshFocus()` remains the single owner of grid focus clearing, mounted-target resolution, poster reprioritization and conservative real-geometry visibility checks. Non-grid Library zones keep the global focus fallback.
- Continued-audit verification: preserved the historical four-argument Search `updateCard` contract after `test-tv-shell` caught an internal signature drift; the poster-spec reuse optimization remains intact. Fresh `npm run verify` passes end-to-end, including ES5/Chrome 53, lint, type contracts, full unit/baseline suite, assets and LG UX checks.
- Continued-audit memory gate: `npm run test:memory` passes with 0/200 weakly retained payloads, 0/100 runtime payloads and ~0.03 MiB net heap growth. `git diff --check` is clean.

## Edge-case regression audit after checkpoint 403e1e03

Scope: validate behavior after the performance changes before pursuing any further optimization. Focus is on list mutation/remount cases, hidden surfaces, stale async work and focus identity.

- [x] Watchlist hidden behind Detail: background mutations must not clear/steal focus from the active Detail surface.
- [x] Watchlist item removal: empty lists must fall back to navbar focus; surviving focused items must be preserved by identity when indices shift.
- [x] Continue Watching/Home: focused item disappearing after playback must restore a deterministic valid focus on Back.
- [x] Library filtered catalog: watched/unwatched mutations that remove the focused item must preserve a valid mounted focus and never retain a stale node.
- [x] Search: result shrink/reorder/remount must clamp or preserve focus without stale card/poster references.
- [x] Backdrop/theme/artwork async work: A->B->A churn, hidden view transitions and cancelled jobs must not reactivate stale UI/media.
- [x] Watchlist scroll rAF: leave/re-enter and list shrink while a frame is pending must not apply stale virtual-window work.
- [ ] Full verify, memory lifecycle, diff-check after any fixes.

Audit started from clean `develop` HEAD `403e1e03`.

Edge-case audit findings so far:
- Watchlist hidden behind Detail exposed a real focus-isolation bug: optimistic/background mutations could call global focus clearing on the hidden surface. `WatchlistView` now receives an active-surface guard from `LibraryFeatureController`; inactive renders update data/DOM but do not clear or claim focus, and stale tracked focus references are released.
- Watchlist mutations now preserve focus by `ratingKey` when list indices shift. If the focused item disappears, the old numeric slot is clamped to a surviving item; if the list becomes empty, focus falls back to navbar.
- Watchlist mutation rollback now restores the previous focus zone as well as items/identity. A failed removal of the final focused card no longer leaves a restored card with logical focus stuck on navbar.
- Watchlist scroll rAF now has a generation guard. A callback scheduled before leave/reset cannot reconcile a re-entered Watchlist or clear ownership of a newer frame even where `cancelAnimationFrame` is missing/ineffective.
- Search result refresh now preserves the focused media by stable `mediaKey` when preceding results disappear/reorder. If the focused result itself disappears it clamps to a surviving slot; if all results disappear it returns to the keyboard.
- Continue Watching/Home edge coverage confirms a completed focused item that disappears restores to the first surviving Home card; an empty Home restores focus to navbar.
- Library grid edge coverage confirms focused media identity is retained across insertions/reorders and a removed focused item falls to a real nearby card without stale DOM focus.
- Progressive artwork edge coverage confirms a card recycled while full-resolution work is deferred drops the old queued full image and resumes only the new media at the original full dimensions.
- Theme A->B->A churn coverage confirms aborted/stale metadata callbacks cannot restart old audio; only the final current request may play.
- Deferred Search backdrop coverage confirms pending backdrop work does not start after leaving Search for another view.

- Search identity restoration exposed a second-order edge: `focus.index` followed the surviving media but `row/column` could remain from the old index. The next directional key could therefore navigate from stale logical coordinates. The refresh now recomputes row/column from the freshly measured layout after result reconciliation; regression coverage verifies the next Right movement.
- Navbar fast-path edge coverage confirms viewport-width changes force a full measured rebuild and removing the visible Watchlist navigation item invalidates cached DOM, clamps focus to a surviving mounted entry, and never reuses the removed button.
- Watchlist pending-frame shrink coverage confirms a scroll callback queued before a list contraction reconciles only the current item set and cannot restore stale indices/cards.
- Search multi-server identity check: no composite server key is required in `SearchView`. Local search is executed against the active `config.apiBaseUrl`, and cloud candidates are resolved through `PlexClient.findByGuid(config, ...)` against that same active PMS before reaching the view. Therefore all `ratingKey` values in a Search result set share one server namespace; direct cross-server ratingKey collisions cannot occur in the current Search flow.

Final edge-case audit verification:
- `npm run verify`: PASS after canonical `npm run build:app`.
- `npm run test:memory`: PASS with 0/200 weakly retained payloads, 0/100 runtime payloads and ~0.03 MiB net heap growth.
- `git diff --check`: PASS.
- No further performance optimizations were added during this edge-case pass; changes are limited to hardening focus/state restoration and stale-callback behavior uncovered by regression tests.

## Home reconcile performance pass after checkpoint 06e96fae

Scope approved by user: optimize Home rendering/reconciliation without any visible, layout, artwork-quality or interaction change.

Planned work:
- [x] Differential section/card placement: do not move DOM nodes already in the correct position.
- [x] Differential Home poster scheduling: unchanged loaded artwork must not recreate specs/jobs; priority upgrades still work.
- [x] Cache stable card/section child references with safe fallback for remounted/legacy nodes.
- [x] Make unchanged Home row-title updates idempotent.
- [x] Add deterministic Home reconciliation regression/benchmark coverage.
- [x] Re-run existing Home/navigation edge-case coverage.
- [x] Full `npm run verify`, memory lifecycle, diff-check and benchmark comparison.

Constraints:
- No CSS/layout/theme visual changes.
- No artwork resolution/quality reductions.
- Keep conservative real-geometry focus/scroll behavior intact.
- Any cardScale/source/preview-to-full change must still trigger the required artwork work.

Implementation / regression coverage:
- Home card updates are now field-differential. A progress-only refresh updates only the existing `.progress-value` width; unchanged title/meta/detail/badges are not rewritten.
- Stable Home sections/cards are placed only when their DOM position is actually wrong. Existing nodes are reused for Continue Watching reorder and Recent additions/removals.
- Home card child references (image/caption/title/meta/detail/library badge/progress) and section child references (title/row) are cached with safe query fallbacks for legacy/remounted nodes.
- Home poster state is tracked by source, exact rendered dimensions, quality tier and priority. Unchanged loaded artwork queues no new specification/job; source/cardScale changes still reload, and moving a preview-only deeper row into the first two rows still upgrades it to full quality.
- Effective `artworkQuality` is part of the Home poster cache signature, so a real quality change still forces a fresh poster load even when source and card dimensions are unchanged. `artworkDataSaver` is intentionally not part of the signature because Settings already caps/persists the effective quality; toggling Data Saver with the same resulting quality changes loader concurrency only and must not reload identical posters.
- Regression coverage explicitly verifies both sides of that rule: `artworkQuality` changes rebuild every mounted Home poster at the requested quality, while toggling Data Saver with the same effective quality queues zero poster specifications/jobs.
- Unchanged Home row titles no longer rewrite text DOM.
- Home hero/preview fields are also differential: unchanged kicker/title/meta/summary produce zero text writes, while a single changed field rewrites only that field.
- Added `npm run benchmark:home-reconcile` for a deterministic 15-row x 12-card synthetic Home.

A/B against checkpoint `06e96fae` on the same Node harness (single reconcile deterministic counters):
- unchanged: 180 card moves + 15 section moves + 180 poster specs/jobs -> 0 + 0 + 0.
- progress-only: 180 card moves + 15 section moves + 180 poster specs/jobs -> 0 + 0 + 0.
- Continue Watching last item promoted to first: 180 card moves + 180 poster specs/jobs -> 1 card move + 0 artwork work.
- Recent item inserted at the front: 180 card moves + 180 poster specs/jobs -> 1 card move + 1 poster spec/job.
- Five-round median synthetic timing after section-reference caching is roughly 54 ms unchanged, 48 ms progress-only, 63 ms Continue Watching reorder and 57 ms Recent insertion per 200 reconciles, versus roughly 132/122/137/125 ms on `06e96fae`. Deterministic operation counts remain the acceptance signal because host timing is noisy.

Final verification after hero differential update and effective-quality cache fix:
- `npm run verify`: PASS, including app bundle freshness, performance budgets, ES5/Chrome 53 parsing, lint, type contracts, full unit/baseline suite, assets and LG UX checks.
- `npm run test:memory`: PASS with 0/200 weakly retained payloads, 0/100 runtime payloads and ~0.02 MiB net heap growth in the final sample.
- `npm run benchmark:home-reconcile`: deterministic counters remain unchanged at 0 work for stable/progress-only artwork/placement, 1 move for Continue Watching reorder, and 1 move + 1 poster job for a Recent insertion.
- `git diff --check`: PASS.

## Lazy adjacent backdrop prefetch after checkpoint c52f7a7b

Scope approved by user: prefetch adjacent-card backdrops opportunistically while keeping theme/audio unchanged.

Planned work:
- [ ] Progressive image loader: one speculative full-backdrop request at a time, foreground always wins.
- [ ] Home: direction-aware adjacent backdrop candidate ordering.
- [ ] Library, Watchlist and Search: adjacent backdrop candidates without changing visible behavior.
- [ ] Cancel/invalidate speculative work on new input/view change/destroy.
- [ ] Ensure prefetched full backdrop is reused by the normal foreground backdrop path.
- [ ] Bound speculative bookkeeping and avoid retaining decoded image objects after completion.
- [ ] Edge-case regression coverage plus full verify/memory/diff-check.

Constraints:
- No theme prefetch.
- No quality/resolution/fade/layout changes.
- No speculative work while foreground image work is active.
- At most one speculative image request at a time.

### Lazy adjacent backdrop prefetch implementation

Completed in TDD from checkpoint `c52f7a7b`:

- [x] Progressive image loader owns one speculative full-backdrop request at a time.
- [x] Speculative work waits until preview/full foreground queues are idle and full-load deferral has cleared.
- [x] Any new foreground image load aborts speculative work immediately.
- [x] A completed prefetch warms the exact full backdrop URL used by the normal foreground path; no preview or duplicate preload is started when that backdrop receives focus.
- [x] Home publishes directional neighbors after media focus movement (last direction first, then opposite and vertical neighbors).
- [x] Library, Watchlist and Search publish geometric adjacent candidates without row wrapping.
- [x] A shared shell scheduler waits 400 ms of quiet time and processes at most one adjacent backdrop at a time.
- [x] Application view changes cancel active/pending speculative backdrop work.
- [x] Foreground backdrop scheduling, clear/destroy and navigation churn cancel speculative work.
- [x] No theme/audio prefetch was added.
- [x] No visual parameters changed: normal backdrop source selection, final 1920x1080 request, quality adjustment, fade and presentation remain unchanged.
- [x] Speculative jobs release their `Image` reference after completion/cancellation; only the existing bounded known-full URL bookkeeping remains.

Regression coverage added for foreground-idle gating, foreground cancellation, latest-pending replacement, explicit cancellation, prefetched-full reuse, Home directional ordering, Library/Watchlist/Search adjacency and application-surface cancellation.

Verification for lazy adjacent backdrop prefetch:

- `npm run verify`: PASS on a fresh full run. One prior full-suite run hit the pre-existing ASS/WASM timing flake; the worker was untouched, passed three isolated consecutive runs, and the subsequent full verify passed.
- `npm run test:memory`: PASS; 0/200 weakly retained payloads, 0/100 runtime payloads, ~0.03 MiB net heap growth.
- Targeted prefetch stress: 20 consecutive cycles of progressive image, Shell, Library, Watchlist and Search tests passed.
- Feature contract and TV-shell static contracts updated for the two explicit Shell prefetch ports and Library focus extension.
- Foreground image work still aborts speculative loading immediately; application view changes cancel it centrally.
- Same-view exits from Library cards to tabs/controls and from Watchlist cards to navigation now cancel speculative backdrop work immediately.
- `document.hidden` cancels speculative backdrop work before Home polling is suspended.
- Review edge-case: cancelling an already-active speculative neighbor cannot advance the chain because Shell invalidates the prefetch generation before the loader cancellation callback runs; covered by regression test.

Final exact-state verification:
- `npm run verify`: PASS.
- `npm run test:memory`: PASS; 0/200 weakly retained payloads, 0/100 runtime payloads; final sample net heap growth ~0.09 MiB, slope ~0.01 MiB/sample.
- `git diff --check`: PASS.

## Home responsiveness follow-up after checkpoint 15dccc2b

User approved all five profiling follow-ups, with no visual changes:

- [x] Coalesce vertical Home artwork warming so key-repeat only warms the final settled row and likely next row.
- [x] Move real Home vertical geometry reads/scroll adjustment into a coalesced requestAnimationFrame path.
- [x] Normalize changed Home refresh payloads once and replace allocation-heavy refresh fingerprinting with exact structural comparison.
- [x] Skip full Home card presentation recomputation on focus when watched/progress state is already synchronized.
- [x] Cache Home row lengths instead of allocating `rows.map(...)` on every keypress.

Constraints:
- Preserve exact artwork/backdrop quality, layout, focus semantics and scroll geometry.
- Preserve real geometry reads for padding/resize correctness; only move them out of the synchronous key handler.
- Preserve public `setRows()` / `useHomeRows()` behavior for raw callers; normalized fast paths are internal only.
- Preserve exact refresh-change semantics (no approximate hash/collision risk).
- Existing navigation/back/detail/player edge-case tests remain mandatory.


### Home responsiveness follow-up results

- Vertical key-repeat now promotes only the focused poster synchronously. Predictive row warming is consolidated after 90 ms of quiet, still before the existing 120 ms full-artwork defer expires; repeated row traversal no longer queues warming for every intermediate row.
- Home vertical scroll correction keeps real `getBoundingClientRect()` geometry but coalesces it through `requestAnimationFrame`; two rapid row moves produce zero synchronous layout reads and one final frame with the two required geometry reads. Environments without rAF retain the conservative synchronous fallback.
- Home refresh polling normalizes each transport response once, then uses exact recursive structural comparison instead of constructing `stableValue()` trees plus JSON strings. A 2,000-case synthetic equivalence probe against the legacy fingerprint produced 0 semantic mismatches. On equal-copy probes, structural comparison was roughly 6-8x lighter than fingerprinting (Node harness; host timing is not an acceptance signal).
- Changed refresh results carry an explicit normalized fast-path through immediate, deferred and hidden-Home application, while raw public callers still normalize normally.
- Focus movement skips full MediaLabels/card-presentation recomputation when media identity, watched state and progress already match the mounted card; retained Detail/Player watched/progress mutations still force the existing full card synchronization.
- Home row lengths are cached on `setRows()` and cleared with Home state, removing the per-keypress `rows.map(...)` allocation.
- Home reconcile deterministic counters remain unchanged: stable/progress-only refreshes do 0 card moves, 0 section moves and 0 poster work; Continue Watching reorder remains 1 move; Recent insertion remains 1 move + 1 poster job.
- Final 15x12 benchmark sample: ~44 ms unchanged, ~47 ms progress-only, ~46 ms Continue Watching reorder and ~54 ms Recent insert per 200 reconciles. A 40x12 stress sample remains bounded with identical deterministic work counts.
- `npm run verify`: PASS on a fresh full run.
- `npm run test:memory`: PASS; 0/200 weakly retained payloads, 0/100 runtime payloads, ~0.03 MiB net heap growth, ~0.01 MiB/sample slope.
- `git diff --check`: PASS.

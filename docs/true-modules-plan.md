# True Module Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace source-only application fragments with independently testable ES5 UMD view modules while preserving Ploff's current webOS behavior.

**Architecture:** `app.js` remains a small composition root over time. Each migrated view receives an explicit dependency object, keeps its private UI state, and exposes only lifecycle and input methods. The legacy source fragment temporarily retains data collection and cross-view transitions until each dependency has a clear owner.

**Tech Stack:** ES5 UMD modules, legacy DOM APIs, Node `assert`, ESLint, TypeScript `checkJs`.

## Global Constraints

- Chrome 53 compatible runtime only.
- No player seek/resume behavior changes during view migrations.
- Each migration must add focused tests and pass `npm run verify`.
- No push until a deliberate release branch is ready.

---

### Task 1: Diagnostics View

**Files:**
- Create: `app/diagnostics-view.js`
- Create: `tests/test-diagnostics-view.js`
- Modify: `app/index.html`
- Modify: `app/source/00-runtime.js`
- Modify: `app/source/45-setup-diagnostics.js`
- Modify: `tests/test-tv-shell.js`

**Interface:** `PloffDiagnosticsView.create(dependencies)` returns `open`, `close`, `refresh`, `handleKey`, `isOpen`, and `destroy`. Dependencies provide the DOM, translation, snapshot, identity request, focus mode, and application-level open/close hooks.

- [x] Write red tests for lifecycle, focus, scrolling, identity refresh, stale callback rejection, and timer cleanup.
- [x] Implement the UMD controller with private state and no application globals.
- [x] Replace diagnostic DOM rendering and timer ownership in the application source with the controller.
- [x] Preserve exact Home/settings transitions through explicit callbacks.
- [x] Run `npm run verify` and commit.

### Task 2: Search View

- [x] Extract request generations, keyboard, virtual cards, focus, and lifecycle to `app/search-view.js`.
- [x] Retain only Plex request adapters and cross-view routing in the composition root.
- [x] Add behavior tests for stale requests, card identity reuse, focus, and Back.
- [x] Verify and commit.

### Task 3: Settings, Server, and Setup Views

- [x] Extract settings rendering, focus, and language-editor state.
- [x] Extract server picker rendering, open state, and focus.
- [x] Extract onboarding/profile rendering from the setup coordinator.
- [x] Keep account and PMS APIs behind injected adapters.
- [x] Verify and commit each independently.

### Task 4: Library and Detail Views

- [x] Extract library/catalog, filters, virtual grid, Watchlist, and Playlists.
- [x] Extract detail metadata, season tabs, episode strip, and preference controls.
- [x] Preserve focus contracts and progressive image ownership.
- [x] Verify each extraction independently; commit remains deferred until the development checkpoint is approved.

### Task 5: Player Views

- [x] Extract player controls and chapters.
- [x] Extract subtitle-editor presentation while keeping Plex persistence and restoration orchestration in the coordinator.
- [x] Keep direct `video.currentTime`, stream replacement, timeline timers, and the native playback session under one explicitly documented coordinator owner; pure decisions remain in the clock, seek, strategy, recovery, buffering, and controls modules.
- [ ] Re-run the physical-TV regression matrix before merging.

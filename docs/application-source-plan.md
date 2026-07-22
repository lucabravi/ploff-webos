# Application Source Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct maintenance of the 8,600-line `app/app.js` monolith with ordered responsibility-based source fragments and a verified deterministic ES5 bundle.

**Architecture:** Preserve the existing application IIFE and lexical scope by splitting its exact bytes into ordered files under `app/source/`. A dependency-free Node script concatenates those files into the checked-in `app/app.js`; CI verifies that the artifact is current before validating the exact code executed by webOS.

**Tech Stack:** ES5 browser JavaScript, Node.js development scripts, ESLint, TypeScript `checkJs`, existing Node and shell tests.

## Global Constraints

- No visible or runtime behavior changes.
- Preserve Chrome 53 compatibility and the existing one-file browser entry.
- Keep installation and runtime independent from Node.js.
- Keep `app/app.js` checked in for ready-to-use packages.
- Never push the development branch.

---

### Task 1: Deterministic bundle tooling

**Files:**
- Create: `scripts/build-app.js`
- Create: `tests/test-app-bundle.js`
- Modify: `package.json`
- Modify: `eslint.config.js`
- Modify: `jsconfig.json`

- [x] Write a failing test requiring an exported ordered source list, deterministic concatenation, check mode, and a bundle matching `app/app.js`.
- [x] Run the focused test and verify it fails because the builder does not exist.
- [x] Implement dependency-free build and check behavior.
- [x] Add `build:app` and `check:app-bundle`; make `verify` check the bundle first.
- [x] Exclude source fragments from independent lint/type-check parsing while continuing to validate the generated bundle.
- [x] Run focused tests and commit the tooling checkpoint.

### Task 2: Mechanical full-source split

**Files:**
- Create: `app/source/00-runtime.js`
- Create: `app/source/10-shell-home.js`
- Create: `app/source/20-search.js`
- Create: `app/source/30-library.js`
- Create: `app/source/40-settings-server.js`
- Create: `app/source/45-setup-diagnostics.js`
- Create: `app/source/50-detail.js`
- Create: `app/source/60-player-controls.js`
- Create: `app/source/65-player-subtitles-playback.js`
- Create: `app/source/70-input-bootstrap.js`
- Regenerate: `app/app.js`

- [x] Split only at top-level function boundaries documented in the architecture.
- [x] Verify concatenating fragments reproduces the pre-split `app.js` byte for byte.
- [x] Regenerate with the checked-in builder and run `check:app-bundle`.
- [x] Run the complete verification suite and commit the mechanical split.

### Task 3: Maintenance and release integration

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/architecture.md`
- Modify: `docs/testing.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `tests/test-baseline.sh`

- [x] Document canonical source ownership and the build command concisely.
- [x] Ensure CI and release verification reject stale generated bundles.
- [x] Add baseline guards for source fragments, builder, and generated warning.
- [x] Run all verification and commit documentation/CI integration.

### Task 4: Whole-application audit

**Files:**
- Modify: `docs/application-source-plan.md`

- [x] Check fragment sizes and boundaries against their documented responsibility.
- [x] Scan for installation-specific hosts, tokens, and credentials.
- [x] Run `npm run build:app`, confirm a clean diff, then run `npm run verify`.
- [x] Mark this plan complete and commit the audit result.

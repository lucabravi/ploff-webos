# Multi-server source resolution implementation plan

> Execute inline with the executing-plans workflow. Preserve the current branch;
> the user's request authorizes autonomous design and implementation.

**Goal:** one owner for choosing a concrete routeable media copy.
**Architecture:** stateless resolver above the concrete Plex router, returning
item and route together; quality ranking and preferences remain in Detail.
**Tech stack:** dependency-free ES5 UMD, Chrome 53, repository Node test harnesses.
**Spec:** `../multi-server-source-resolution.md`.

## Global constraints

Stay on `develop`; no push, branch, worktree, dependency or persistence migration.
Do not edit generated bundles manually or modify ASS/subtitle/libass/worker runtime.
Keep all existing gates and budgets; no startup fan-out or network in the resolver.
Checkpoint verification: `npm run verify && npm run test:memory`,
`git diff --check`, `git fsck --no-dangling`.

## 1. Baseline and decision

- [x] Verify archive SHA-256, HEAD, branch and clean status.
- [x] Read handoff and audit concrete ownership/routing/projection/queue consumers.
- [x] Run check:app-bundle, check:es5, check:architecture,
  check:maintainability, typecheck:contracts, typecheck and npm test.
- [x] Record alternatives, chosen contract and migration before runtime edits.

## 2. Resolver contract (independently testable checkpoint)

Files: `app/coordinator/media-source-resolver.js`, `app/multi-server-media.js`,
`tests/test-media-source-resolver.js`, `tests/test-multi-server-media.js`,
`scripts/build-app.js`.

- [x] Add RED tests for the contract below, and execute
  `node tests/test-media-source-resolver.js` before implementation.

```js
var result = resolver.resolve(staleB, { candidateContext: oldB });
assert.strictEqual(result.item.ratingKey, 'a-copy');
assert.strictEqual(result.route.config.token, 'token-a');
assert.strictEqual(result.fallback, true);
assert.deepStrictEqual(staleB, before);
assert.strictEqual(resolver.resolve(bOnly), null);
```

- [x] Exercise all eight A/B/C enabled combinations, current/unknown preference,
  owner-before-affinity ordering, repeated calls after enable/disable, empty
  tokens, duplicate identities, malformed variants and single-server call counts.
- [x] Implement `create({sourceRouter})`, `resolve(item, options)` and
  `available(item, options)` using one synchronous candidate traversal.
- [x] Reuse `MultiServerMedia.selectSourceVariant(item, machine, ratingKey)`;
  preserve the two-argument API and use the optional discriminator for exact copies.
- [x] Add the resolver after PlexSourceRouter in the Core manifest and regenerate
  using `npm run build:app`; run focused tests and all checkpoint gates; commit.

## 3. Consumer migration

Files: ApplicationController, MultiServerContentController,
PlayerFeatureController, DetailFeatureController and their test harnesses.

- [x] Add RED composition assertions that Content, Detail and deferred Player
  receive the same resolver instance; add consumer unavailable-artwork tests.
- [x] Construct one resolver in Application. Replace Application's and Content's
  fallback loops with `resolve`; preserve the original aggregate at Detail entry.
- [x] Replace Player's manual projection and fallback loop. A resolved item always
  supplies both ratingKey and request context; failed resolution cannot use session
  credentials for images. Keep queue identity/occurrence algorithms unchanged.
- [x] Replace Detail's preference/availability loops and source-list filtering.
  Use `resolution.fallback` to enter the existing profile ranking workflow.
  Exact source confirmation must reject a returned different PMS before persistence.
- [x] Preserve direct concrete routing for config-only requests and session adoption.
  Do not insert hidden fallback into those calls.
- [x] Run Detail language/version tests and Player/queue/composition/Content tests,
  rebuild bundles, execute all gates and commit the integrated migration.

## 4. Boundary and delivery

- [x] Add a guard that only the resolver consumes source projection in production
  and that no feature owns the removed fallback/projection implementations.
- [x] Run guard RED/GREEN tests; document the new boundary in the current index and
  architecture references without relaxing existing guards.
- [x] Run full verify, memory, diff and object-integrity gates. Compare authored
  runtime changes and protected files with baseline, record limits and measurements.
- [x] Commit and export a clean ZIP including `.git` and excluding `node_modules`;
  retain logs and a patch relative to the authoritative baseline.

## Evidence

Baseline requested gates: PASS after restoring archive executable modes and
recreating flattened `.bin` launchers. No project source/dependency changes were
needed for that environment repair. Runtime checkpoint evidence is recorded at
completion below; an unexecuted physical-LG/Plex test is never marked passing.


Checkpoint history:

- `02e70ec`: audit and design recorded before runtime changes; full gates passed.
- `99c36f7`: bounded resolver and pure projection discriminator; full gates passed.
- `42dbce0`: shared feature integration and source-field completeness; full gates
  passed, including the retained profile-ranking and queue lifecycle regressions.

Measured runtime and bundle deltas, regression evidence and physical-device limits
are recorded in the spec's Implemented outcome and Regression evidence sections.


Final evidence: full `npm run verify` PASS (256 unit-test files plus baseline),
`npm run test:memory` PASS, `git diff --check` PASS, `git fsck --no-dangling` PASS.
The maintainability ownership guard was observed RED before implementation and
GREEN afterward. Protected-file/body comparison found no subtitle/ASS/worker
runtime change. Archive extraction/integrity and exact commit identity are
recorded in the delivery evidence outside the repository to avoid a self-hash.

# General maintenance review - 2026-09-06

## Scope and baseline

This pass starts at `328f69dbf6e990eb3974219d0cc04c8e8ffe9d22` on `develop`.
It reviews general code quality independently from deferred Player activation.
The initial full verification and memory gates passed; the memory sample retained
0/200 payloads and 0/100 runtime payloads (net heap growth +0.06 MiB).
No runtime dependencies, modern runtime syntax, storage migrations, version bumps,
new branches, pushes, or tags are part of this work.

The duplicate scan covered 183 authored JavaScript files under `app/`, `scripts/`,
and `webos-service/`, excluding generated bundles, vendor files, and locales. It
found 33 exact function-body groups at the selected minimum size. Most are small
owner-local helpers; this number is an investigation aid, not a refactoring target.
A source review also examined non-identical response parsing, recommendation
traversal, lookup maps, and discovery ownership.

## Checkpoint 1 - response callback boundaries

A new regression suite reproduced duplicate completion in 23 public client paths:
a consumer throwing during a successful response was caught as a parser error and
called again. Each parser now finishes its conversion inside the try/catch, then
notifies the consumer outside it. Playback response preparation keeps its existing
mapping and stream-selection policy; only the exception boundary changes.

`tests/test-plex-response-callbacks.js` covers 92 success, invalid-payload,
HTTP-failure, and throwing-consumer cases using the real client modules and parsers.
A shared test-only controllable XHR keeps browser event simulation out of production.
No public client surface changed. The raw HTTP transport still owns XHR lifecycle,
not domain parsing or credentials.

## Checkpoint 2 - remove an obsolete authentication path

Caller tracing showed that `PlexAuth.loadLocalServerAccess` was exported and tested
but unused by production. More importantly, `test-tv-shell.js` already forbids that
flow in profile activation: account access must be exchanged through Plex resources,
not sent to a discovery endpoint merely because its identity string matches.

The reviewed choice is deletion rather than repairing this unused two-request
helper. Its old positive test is replaced by an explicit supported-Auth surface
contract and a real-transport test of the live approved-route cancellation flow.
PIN, profile switching, server-specific token exchange, and cached offline profiles
retain their existing owners and implementations.

## Checkpoint 3 - owner-local model consolidation and identity lookups

Home flat/row recommendation parsing previously repeated XML traversal, eligibility,
and hub priority logic. One private traversal now owns those mechanics. The existing
public methods retain separate deduplication scopes: flat results use a global set
after hub ranking; each row uses its own set. Source order breaks priority ties
explicitly. XML validation reuses the existing media-document owner.

Nine behavioral regression cases reproduced inherited-property collisions in private
lookup sets/counts across six pure-model modules. Those private maps now use ES5
prototype-free objects; no persistent or returned record shape changes. Coverage
includes search, recommendations, Watchlist GUID resolution, recent season counts,
and subtitle language labels. The unusual keys are synthetic robustness fixtures,
not evidence of a live Plex incident. Ordinary recommendation behavior is separately
characterized with actual XML and the real media mapper.

The maintenance guide now names the actual Home model owner, not the media mapper.
No new shared utility module, dependency, or public model method was added.

## Checkpoint 4 - discovery operation lifecycle

Executable tests of the actual Luna service (with only native socket/timer/service
boundaries simulated) reproduced deadline retention after errors, packet handling
after completion, late-bind sends, and uncaught synchronous socket setup failures.
Each discovery operation now owns and clears its deadline, detaches its packet
listener, rejects retained late callbacks, and completes once. A guarded error
listener remains while native close completes; removing every listener would make
late socket errors unsafe. Concurrent discover operations remain independent.

The service still sends the same multicast and broadcast requests and uses the same
2200 ms collection window. Valid results, account trust policy, and public response
shape are unchanged. Prototype-free lookup also protects server deduplication.
The parser now rejects non-integer ports rather than returning unusable URLs.

The 12 behavioral service cases supplement, not replace, source/packaging tests.
The parser suite additionally locks invalid ports, legal bounds, default port, and
missing-address behavior. These tests do not simulate a physical LG network stack.

## Architecture assessment and deliberately retained duplication

No broad rewrite is warranted by this review. The useful changes remove an obsolete
public path, put shared recommendation mechanics back under their existing owner,
and make parsing/completion and discovery lifetime boundaries explicit. There is no
new service locator, generic event framework, global utility bag, or extra controller.

Small `call`, copy-record, and abort wrappers remain owner-local where sharing would
couple unrelated features. They are not deleted merely to reduce a clone count.
ServerDiscovery.probe and PlexHttp.request retain separate lifecycle implementations:
the former has a tested immediate setup-failure result, while the latter deliberately
defers setup-failure completion. A shared transport refactor requires an explicit
contract decision, not mechanical deduplication. Existing guards protect these rules.

Large controller size alone is not a reason to split it. Coordinator sources, native
playback ownership, the deferred loader/build layout, ASS assets, Settings persistence,
and feature contracts are outside the runtime changes of this pass. The intentionally
retained recommendation transport entry point and on-demand diagnostics stay intact.

## Verification observation

One Checkpoint 1 full run timed out in the unchanged real ASS worker profile test.
The isolated worker test and the subsequent full default-concurrency run passed.
The worker, its assets, and all timeout limits were left untouched. Both logs are
retained; the underlying timing sensitivity is not claimed to be diagnosed or fixed.

## Acceptance limits

Physical-LG acceptance and network-dependent dependency auditing are not performed
by this maintenance pass. Automated verification is not physical-TV signoff.

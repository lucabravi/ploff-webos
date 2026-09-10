# HLS player clock review and implementation

## Scope and baseline

The user reports DP fully synchronized through seek/buffering and asks to repair
transcoding with local ASS. The review starts at clean develop `51f5dcc` and keeps
Chrome 53 / LG compatibility. Automated baseline: full verify (231 test files) and
memory passed. The user's real-TV observation is not a new physical signoff by the
executor; no TV or live Plex media server was available during this work.

## Findings and corrections

### 1. Source replacement was not one clock transaction

In-place HLS reconstruction could accept playing from the preceding source, or a
delayed resume could fire during a newer Plex preparation. With old native time 25
and new offset 500, one reproduced trace published 525 instead of remaining frozen
at 500. A fractional rebuild also reset ASS to requested 350.8 but installed origin
350, leaving a renderer epoch ahead of its media source.

A shared beginSourceSwitch operation now retires the previous buffering/resume work,
starts the session-owned replacement guard, freezes the absolute checkpoint and
primes the matching local ASS epoch. Source assigned and source ready are separate
facts. Resume and retry closures validate playback reference, generation, transcode
session and readiness; queued canceled callbacks cannot start a later source.
HLS canplay with readyState below 3 cannot authorize replacement, even after URL
assignment. Same-track ASS content/renderer reuse is retained.

First verified checkpoint: `9c23433` (233 unit-test files, memory passed).
The final checkpoint adds the queued-canplay/low-ready-state coverage.

### 2. Native HLS seeks did not participate in decoded settlement

A native HLS seek to absolute 130 on a source starting at 100 writes native time 30.
The previous code could expose ASS immediately at that provisional value. When the
decoder then exposed 29.5, the public clock stayed at 130 without an ASS epoch reset;
a larger preceding keyframe could provoke a needless source rebuild.

PlaybackReposition now accepts explicit HLS seek evidence alongside its unchanged
DP policy. HLS must retain the captured source offset and prove the observed native
time is buffered. One bounded rollback becomes the absolute media position and
opens the matching ASS epoch before the gate exposes subtitles. No offset is guessed.
The five-second forward expiry and 15-second rollback bound are the existing seek
limits, not a new unlimited clock correction. Unbuffered/invalid/different-source
samples do not authorize adoption. Startup does not arm this HLS seek allowance.

A buffer incident inside the armed seek can consume that same one-shot settlement;
ordinary buffering keeps the existing repair rules. A successful verification timeout
for an omitted HLS seeked event retains the target until completion consumes it.

Second verified checkpoint: `a86a10a` (235 unit-test files, memory passed).
Seven policy groups and eighteen HLS integration traces pass. A 5,000-trace,
60,000-sample deterministic comparison against baseline DP settlement returned
identical policy results. This is comparative synthetic evidence, not decoder data.

### 3. The editor's ASS clock owner was omitted from immediate pause/sync

Opening the editor clears normal local subtitle state and transfers ownership to
the preview. Clock synchronization still looked only at normal local state, so
waiting/pause/seeking could leave the preview worker running until a later preview
timer. It now receives the active editor state and uses the same owner/offset as
rendering. Closed or text previews cannot drive a restored ASS owner. No change to
the worker protocol, painter, fonts, parser or DP native-clock tolerance was needed.

## Delivery and subtitle matrix

| Actual delivery or decision | Clock contract | Tested caption ownership |
| --- | --- | --- |
| Direct Play | Full-file native clock, existing settlement unchanged | ASS, SRT, off |
| Direct Stream / remux | Active source origin + native seconds | ASS, SRT, off |
| Audio-only conversion | Same HLS domain; real decision mapper labels transcode-audio | ASS |
| Video-only conversion | Same HLS domain | ASS; broader TC caption matrix below |
| Audio + video conversion | Same HLS domain | ASS; broader TC caption matrix below |
| Transcode / safe-transcode | Same HLS domain, guarded source replacement | External/embedded ASS, SRT, server, off |
| Forced transcode | Existing server-caption policy | Server ASS, no local renderer |

The matrix has 33 public-flow scenarios. The editor adds twelve scenarios across
DP, DS, TC and safe-TC. Controls distinguish existing product behavior from defects:
DS cold reopen accepts a fractional origin, while an in-place TC rebuild normalizes
to whole seconds. Their source/epoch clocks must agree with the origin actually sent,
not be forced to the same rounding policy. Terminal auto-pause preserves the original
user play/pause intent when deliberately seeking backward; it is not a new user pause.

## Architectural assessment

A rewrite or new service/event framework was not justified by these faults. Existing
native-driver, timeline, session, reposition and subtitle boundaries are useful. The
important simplification is one source-transition orchestration and one decoded-seek
settlement policy with explicit delivery evidence, not another subtitle correction
clock or duplicated HLS-only player. The coordinator remains sizeable, especially its
subtitle-editor orchestration; splitting it during timing repair would be structural
churn rather than a demonstrated behavioral improvement.

The original DP/controller behavioral suites are unchanged. One TV-shell structural
assertion was updated to follow the extracted helper while preserving retirement
ordering checks. NativeVideoDriver, PlaybackClock, PlaybackTimeline, seek decision
policy, fallback strategy, Plex URL options, ASS renderer/worker assets and deferred
Core startup remain protected by diff checks and the complete original regression
suite. Shared lifecycle safety and editor-owned clock delivery did change; this is
not a claim that every DP execution path is byte-identical.

## Evidence and limits

New versioned tests and implementation plan are linked from docs/README.md. ZIP
checkpoints include the full project, local Git history, and verification logs with
RED/GREEN traces, baseline verification, policy comparison and archive checks.
No pushes, tags, branches, dependency upgrades, version bumps or budget increases.

Physical LG / Chrome 53 execution and a live Plex decode were not performed. Node
ES5 parsing, static LG checks, fake native traces and existing real-worker tests do
not prove visible frame synchronization on a television. See the additional physical
drill in docs/testing.md. A server/decoder discontinuity not represented in a native
clock trace remains a possible separate cause of desync; do not infer one or conceal
it with a manually guessed ASS-only offset.

## Final automated checkpoint

Full `npm run verify` passes with 238 unit-test files (seven added to the baseline).
The memory lifecycle gate passes with retained payloads 0/200 and retained runtime
payloads 0/100. Diff whitespace, Git object integrity, ES5 parsing, build freshness,
architecture, types, packaging and existing worker tests remain enabled. The ZIP
manifest and verification folder record the commit-specific outputs and final heap
measurement. Independent reviewer/subagent review was not available; the executor
reviewed the diff and used the original suites, focused regressions and policy audit.

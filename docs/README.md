# Documentation

This is the authoritative index for current Ploff documentation. Completed or
superseded records that still add historical value live under `archive/`; older
ephemeral plans remain available in Git history. The September 6 checkpoint/acceptance
records remain linked until physical-LG validation of deferred startup is complete.
Active acceptance work and implemented architecture references are distinguished below.

## Start here

- [`../README.md`](../README.md) — product overview, installation, first launch, and developer entry point.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — coding, compatibility, testing, and pull-request requirements.
- [`../TODO.md`](../TODO.md) — current actionable roadmap only.

## Active acceptance and checkpoint records

- [`TODO-detail-versions-prefetch.md`](TODO-detail-versions-prefetch.md) - current multi-server episode Version fix status, physical-TV confirmation from 2026-09-21, and the remaining targeted TV edge cases.

- [`cleanup/2026-09-06-hls-player-clock-review.md`](cleanup/2026-09-06-hls-player-clock-review.md) - HLS seek/source synchronization fixes, delivery matrix, preserved DP policy, and pending physical-LG validation.
- [`cleanup/2026-09-06-hls-player-clock-plan.md`](cleanup/2026-09-06-hls-player-clock-plan.md) - implementation checkpoints and regression evidence for the player clock review.

- [`cleanup/2026-09-06-maintenance-follow-through-plan.md`](cleanup/2026-09-06-maintenance-follow-through-plan.md) - completed maintenance sequence, checkpoint gates, and final acceptance record.
- [`cleanup/2026-09-06-startup-player-code-splitting-design.md`](cleanup/2026-09-06-startup-player-code-splitting-design.md) - implemented Core/deferred Player boundary, early ASS exception, and pending physical-LG acceptance criteria.
- [`cleanup/2026-09-06-startup-player-code-splitting-plan.md`](cleanup/2026-09-06-startup-player-code-splitting-plan.md) - implementation/acceptance record with verified test commands and atomic activation sequencing.

## Architecture and maintenance

- [`multi-server.md`](multi-server.md) - current multi-server inventory, route
  selection, Home/Search aggregation, virtual libraries, and Settings semantics.
- [`player-lifecycle-ownership.md`](player-lifecycle-ownership.md) - implemented playback/source/queue lifetimes, operation ownership, transport binding and teardown contract.
- [`cleanup/2026-09-15-player-lifecycle-audit-it.md`](cleanup/2026-09-15-player-lifecycle-audit-it.md) - Italian architectural audit, decisions, regressions, measured verification and physical-device acceptance.

- [`multi-server-source-resolution.md`](multi-server-source-resolution.md) - implemented source-resolution boundary, architectural audit, alternatives, acceptance evidence and checkpoint plan.

- [`cleanup/2026-09-06-general-maintenance-review.md`](cleanup/2026-09-06-general-maintenance-review.md) - general client, model, and discovery maintenance review with checkpoint evidence.

- [`cleanup/2026-09-06-settings-backup-boundary-review.md`](cleanup/2026-09-06-settings-backup-boundary-review.md) - completed ownership review and tested restore/teardown corrections; no new runtime owner.

- [`architecture.md`](architecture.md) — runtime components, ownership, data flow, and compatibility constraints.
- [`application-source-architecture.md`](application-source-architecture.md) — coordinator sources and generated Core/Player artifact rules.
- [`maintenance.md`](maintenance.md) — extension boundaries, lifecycle ownership, and maintenance guardrails.
- [`runtime-architecture-redesign.md`](runtime-architecture-redesign.md) — implemented runtime ownership boundaries and extension rules (completed 2026-08-19), not an active migration.
- [`testing.md`](testing.md) — automated gates, memory checks, benchmarks, and physical-TV signoff.
- [`catalog-performance.md`](catalog-performance.md) — current deterministic Library benchmark reference and retained baseline.

## Product behavior

- [`features.md`](features.md) — viewer-facing functionality.
- [`settings.md`](settings.md) — persisted Settings schema, migrations, and UI/schema boundary.
- [`themes.md`](themes.md) — seven shipped visual themes, Chrome 53-safe styling rules, and extension workflow.
- [`diagnostics.md`](diagnostics.md) — privacy-safe support-report boundary and export flow.
- [`playback-invariants.md`](playback-invariants.md) — native playback, seek, subtitle, and resume invariants.
- [`ass-local-renderer.md`](ass-local-renderer.md) — current local ASS/SSA editor policy, cold-start prewarm, worker profile, and telemetry.
- [`virtual-playback-queue-design.md`](virtual-playback-queue-design.md) — bounded virtual playback queue architecture.
- [`queue-playlist-ux-design.md`](queue-playlist-ux-design.md) — queue drawer and playlist restoration behavior.
- [`up-next-layouts.md`](up-next-layouts.md) — Up Next presentation and exhausted-queue behavior.

## Release and distribution

- [`github-settings.md`](github-settings.md) — expected public-repository configuration.
- [`release-signoff/`](release-signoff/) — physical-TV release template and retained release evidence.
- [`store-submission/`](store-submission/) — LG Content Store worksheets, reviewer guidance, and submission checklist.
- [`benchmarks/`](benchmarks/) — retained baseline/current/stress catalog benchmark outputs.
- [`screenshots/`](screenshots/) — current repository screenshot assets; image refresh is independent from documentation maintenance.

## Historical implementation records

- [`archive/`](archive/) — completed plans, superseded designs, and progress logs
  retained for historical context only. These files are not current behavior
  references.

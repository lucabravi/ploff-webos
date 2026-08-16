# Documentation

This is the authoritative index for current Ploff documentation. Completed migration
plans and implementation checklists are intentionally not kept in the working tree;
Git history remains the archive for that material.

## Start here

- [`../README.md`](../README.md) — product overview, installation, first launch, and developer entry point.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — coding, compatibility, testing, and pull-request requirements.

## Architecture and maintenance

- [`architecture.md`](architecture.md) — runtime components, ownership, data flow, and compatibility constraints.
- [`application-source-architecture.md`](application-source-architecture.md) — coordinator sources and generated `app/app.js` rules.
- [`maintenance.md`](maintenance.md) — extension boundaries, lifecycle ownership, and maintenance guardrails.
- [`testing.md`](testing.md) — automated gates, memory checks, benchmarks, and physical-TV signoff.
- [`catalog-performance.md`](catalog-performance.md) — current deterministic Library benchmark reference and retained baseline.

## Product behavior

- [`features.md`](features.md) — viewer-facing functionality.
- [`settings.md`](settings.md) — persisted Settings schema, migrations, and UI/schema boundary.
- [`themes.md`](themes.md) — five shipped visual themes, Chrome 53-safe styling rules, and extension workflow.
- [`diagnostics.md`](diagnostics.md) — privacy-safe support-report boundary and export flow.
- [`playback-invariants.md`](playback-invariants.md) — native playback, seek, subtitle, and resume invariants.
- [`up-next-layouts.md`](up-next-layouts.md) — Up Next presentation and exhausted-queue behavior.

## Release and distribution

- [`github-settings.md`](github-settings.md) — expected public-repository configuration.
- [`release-signoff/`](release-signoff/) — physical-TV release template and retained release evidence.
- [`store-submission/`](store-submission/) — LG Content Store worksheets, reviewer guidance, and submission checklist.
- [`screenshots/`](screenshots/) — current repository screenshot assets; image refresh is independent from documentation maintenance.

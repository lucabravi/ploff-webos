# Documentation

This index is the authoritative starting point for the public Ploff
documentation. It contains the current runtime, maintenance, testing, and
playback references shipped with the project.

## Current project references

- [`../README.md`](../README.md) — product overview, installation, and contributor entry point.
- [`architecture.md`](architecture.md) — runtime architecture, ownership, and design constraints.
- [`application-source-architecture.md`](application-source-architecture.md) — generated bundle and coordinator source rules.
- [`features.md`](features.md) — current viewer-facing functionality.
- [`maintenance.md`](maintenance.md) — runtime ownership, guardrails, and extension rules.
- [`testing.md`](testing.md) — automated gates, memory checks, and physical-TV signoff.
- [`playback-invariants.md`](playback-invariants.md) — native playback, seek, and subtitle invariants.

## Current feature and performance references

- [`virtual-playback-queue-design.md`](virtual-playback-queue-design.md) — bounded queue model and providers.
- [`paginated-playback-queue-completion.md`](paginated-playback-queue-completion.md) — delivered queue architecture and locked invariants.
- [`queue-playlist-ux-design.md`](queue-playlist-ux-design.md) — queue drawer, playlist restoration, and profile refresh behavior.
- [`up-next-layouts.md`](up-next-layouts.md) — Up Next layouts and exhausted-queue behavior.
- [`release-signoff/`](release-signoff/) — the physical-TV release checklist used by tagged builds.

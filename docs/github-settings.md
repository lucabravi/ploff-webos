# Public Repository Settings

Complete this checklist when the clean repository becomes public:

- Enable private vulnerability reporting, secret scanning, and push protection.
- Protect `main`; require pull requests and the `Tests / test` status check.
- Block force pushes and branch deletion on `main`.
- Enable automatic branch deletion after merge.
- Prefer squash merges and require a meaningful pull-request title.
- Restrict release workflow changes through `CODEOWNERS` or required review.
- Enable immutable releases when available and sign release tags.
- Keep Issues enabled; disable unused Projects and Wiki features.
- Add the repository description, homepage, and topics: `plex`, `webos`,
  `lg-tv`, `media-client`, `offline-first`, and `legacy-tv`.
- Confirm that generic IPKs and `SHA256SUMS` are the only release assets.

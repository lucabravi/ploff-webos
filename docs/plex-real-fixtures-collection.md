# Codex TODO — Collect private real Plex fixtures

This checklist is for an agent with authorized access to the real Plex Media Server.
Its purpose is to collect representative API responses that can later be turned into
stable regression fixtures for Ploff.

The current fixture set is for the private development repository. Media titles,
summaries, technical metadata, and file basenames are intentionally preserved because
they are the data under test. This dataset is not suitable for the public repository
without a separate content-redaction pass.

Do not modify Ploff runtime behavior as part of this task. Keep raw Plex responses
outside the repository and never commit credentials or unsanitized responses.

## Current status

The private fixture set has been collected and sanitized. It now covers the server
identity, same-season subtitle matching, forced subtitles, external SRT, embedded and
external ASS, multiple audio tracks, multi-part and multi-version media, extras, a
series/season/episode hierarchy, exact playlist and collection ordering, playback
chapters and credits markers, and a media item with no subtitle streams.

WebVTT and SSA were not present in the sampled library, so they are intentionally not
fabricated. The corresponding cases remain unavailable until a real Plex response is
provided. The current files are private fixtures only: titles and technical media
metadata remain by design, while server, profile, path, host, IP, token, and identity
data are sanitized.

## Goal

Collect a small, high-value set of real Plex API responses, sanitize them rigorously,
and deliver a ZIP containing only anonymized fixtures plus a manifest. The follow-up
integration into Ploff tests is a separate task.

## Safety rules

- [ ] Never write `X-Plex-Token`, cookies, passwords, `.env` contents, or other credentials into collected files.
- [ ] Never commit raw Plex responses.
- [ ] Keep original dumps temporarily outside the repository.
- [ ] Remove or replace real public/private IP addresses and real hostnames.
- [ ] Remove or replace `machineIdentifier` and other unique server/account identifiers.
- [ ] Remove or replace Plex account/profile names and private library names.
- [ ] Remove or replace filesystem paths, private URLs, and other identifying metadata that is not needed by the fixture.
- [ ] Preserve media titles, summaries, technical metadata, and file basenames for the private fixture set; require a separate redaction pass before publication.
- [ ] Preserve technical metadata needed by tests: container, codec, bitrate, resolution, HDR, bit depth, audio codec, channels, language, `languageCode`, subtitle codec, forced state, external/internal state, selected/default state, indices, `Media -> Part -> Stream` structure, version count, and part count.
- [ ] Keep ID replacement deterministic: the same source ID must always map to the same sanitized ID inside the dataset.

Example deterministic mappings:

```text
ratingKey="87342" -> ratingKey="episode-001"
stream id="14732" -> stream id="subtitle-001"
part id="382901"  -> part id="part-001"
```

## 1. Record Plex Media Server version

- [ ] Query `/identity` using the authorized local Plex connection.
- [ ] Record the Plex Media Server version in `MANIFEST.md`.
- [ ] Preserve protocol/version information only when technically useful.
- [ ] Remove `machineIdentifier`, server names, network addresses, and other unique identifiers.

## 2. Same-season episode subtitle matching — highest priority

Find one season with at least three episodes that expose comparable subtitle tracks.
For each selected episode:

- [ ] Save the complete response from `GET /library/metadata/<ratingKey>`.
- [ ] Ensure the captured response contains the relevant `Media`, `Part`, and `Stream` hierarchy.
- [ ] Prefer episodes where Plex assigns different subtitle stream IDs to semantically equivalent tracks.
- [ ] Prefer a repeated track profile such as Italian ASS or SRT with the same forced/external semantics across all three episodes.
- [ ] Preserve language, codec, external/internal state, forced state, title when technically significant, stream index, part relation, and media relation.

The dataset must make it possible to verify later that Ploff can match a season-level
subtitle preference semantically even when each episode has a different Plex stream ID.

## 3. Forced subtitles

Find at least one item with a real Plex subtitle stream marked forced.

- [ ] Prefer a case where the same language also has a non-forced subtitle track.
- [ ] Save the complete metadata response.
- [ ] Preserve the forced flag and enough stream metadata to distinguish the tracks without relying only on their display titles.

## 4. External SRT / WebVTT

Find at least one item with an external SRT or WebVTT subtitle.

- [ ] Save complete metadata.
- [ ] Preserve codec, language, `languageCode`, external/internal state, forced state, title when technically significant, stream index, and hierarchy.
- [ ] Remove original subtitle path and filename.
- [ ] If both SRT and WebVTT are readily available and structurally different, collect one of each.

## 5. ASS / SSA

Collect real ASS metadata and SSA separately when available.

- [ ] Prefer both external and embedded ASS examples when readily available.
- [ ] Preserve codec, language, forced state, title, selected/default state, and stream hierarchy.
- [ ] If no SSA item exists in the library, record that fact in `MANIFEST.md`; do not fabricate one.

## 6. Multiple audio tracks

Find one item with at least two materially different audio streams; three is preferable.

- [ ] Save complete metadata.
- [ ] Preserve codec, channels, language, `languageCode`, selected/default state, title, index, and hierarchy.
- [ ] Prefer a useful combination such as multiple languages, surround plus stereo, or different codecs.

## 7. Multi-part media — high priority

Find an item represented by Plex as multiple `Part` nodes under the same media item.

- [ ] Save `GET /library/metadata/<ratingKey>`.
- [ ] Preserve the exact `Media -> Part -> Stream` relationships.
- [ ] Remove original part filenames and filesystem paths.
- [ ] Do not confuse multi-part with multi-version.
- [ ] If no real multi-part item exists, record that in `MANIFEST.md`; do not fabricate one.

## 8. Multi-version media — useful, lower priority

Ploff already supports and tests multi-version playback. This capture is only to retain
one real-world Plex metadata shape if it is easy to obtain.

- [ ] If readily available, capture one item with two or more Plex media versions.
- [ ] Prefer technically distinct versions, for example 1080p H.264 SDR and 2160p HEVC HDR.
- [ ] Preserve version-level technical fields and each version's part/stream hierarchy.
- [ ] Do not spend significant time searching for this case if it is not immediately available.

## 9. Extras / trailers — lower priority

If readily available:

- [ ] Capture the parent item metadata.
- [ ] Capture the Plex response that enumerates or represents its Extras.
- [ ] Include at least one trailer or another real Extra when available.

## 10. Sanitized output structure

For private regression work, store the sanitized dataset under
`tests/fixtures/plex-real/` using this structure, omitting cases that are not
available. Keep the raw capture outside the repository:

```text
plex-real-fixtures-sanitized/
├── MANIFEST.md
├── server/
│   └── identity.xml
├── hierarchy/
│   ├── series.xml
│   ├── series-seasons.xml
│   └── season-01-episodes.xml
├── season-subtitle-cascade/
│   ├── episode-001.xml
│   ├── episode-002.xml
│   └── episode-003.xml
├── subtitles/
│   ├── forced.xml
│   ├── external-srt.xml
│   ├── ass-external.xml
│   └── ass-embedded.xml
├── audio/
│   └── multiple-audio.xml
├── multipart/
│   └── multipart.xml
├── multiversion/
│   └── multiversion.xml
├── collections/
│   └── collection-order.xml
├── playlists/
│   └── quintessential-quintuplets.xml
├── edge/
│   └── no-subtitles.xml
├── playback/
│   └── chapters-and-markers.xml
└── extras/
    ├── parent.xml
    └── extras.xml
```

Do not create synthetic files only to fill missing directories.

## 11. MANIFEST.md requirements

For every captured fixture record:

- scenario type;
- Plex endpoint queried;
- Plex Media Server version;
- why the case is technically interesting;
- important media/stream characteristics;
- the categories of data sanitized;
- requested cases that were not available.

For the three same-season episodes, explicitly note whether the equivalent subtitle
tracks have different original Plex stream IDs while preserving the sanitized values
used in the delivered fixtures.

## 12. Anti-leak review before handoff

Recursively inspect every sanitized file and verify all of the following:

- [ ] No `X-Plex-Token`.
- [ ] No Plex token in a query string.
- [ ] No real IP address.
- [ ] No real hostname.
- [ ] No original `machineIdentifier`.
- [ ] No original filesystem path.
- [ ] No private Plex account/profile name.
- [ ] No private library name.
- [ ] Media titles and filenames are intentionally retained only for the private fixture set; do not copy this set to the public repository without a second redaction pass.
- [ ] No raw dump included in the final archive.
- [ ] No `.env`, local Plex configuration, cookies, logs, or credential-bearing scripts.
- [ ] Less obvious XML attributes and nested values have also been reviewed, not only the primary fields.

## 13. Deliverable

Produce the private fixture directory and, when a portable handoff is useful:

```text
plex-real-fixtures-private.zip
```

The archive must contain only sanitized fixtures and `MANIFEST.md`; it must not contain
raw captures, credentials, or local configuration.

Report back with:

```text
PMS version: <captured version>
Fixtures collected: <list>
Cases unavailable: <list>
Anti-leak review: passed/failed with details
SHA-256 archive: <sha256>
```

Do not modify parser behavior or playback logic in this task. The next task can compare
these fixtures with Ploff's current parsers and decide which cases should become
permanent regression tests.

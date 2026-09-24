# Sanitized Plex Fixture Manifest

These XML fixtures were captured from an authorized local Plex Media Server for
Ploff regression testing. Media-facing text and identifying artwork references have
been replaced with synthetic values; structural and playback metadata remain for the
scenarios under test.

## Source

- Plex Media Server: `1.43.3.10896-cb3ebc72`
- Requests: `/identity`, `/library/metadata/<ratingKey>`, `/library/metadata/<ratingKey>/extras`,
  `/library/metadata/<ratingKey>?includeChapters=1&includeMarkers=1`, and the
  authorized library container endpoints used for ordering.
- Access route: local LAN only; the source address is intentionally not retained.

## Collected fixtures

| Fixture | Scenario | Representative data |
| --- | --- | --- |
| `server/identity.xml` | Server identity | PMS version and protocol metadata; server identifier removed. |
| `season-subtitle-cascade/episode-001.xml` | Same-season subtitle matching | Synthetic episode; HEVC and AV1 versions, Italian ASS embedded and external, distinct source stream IDs. |
| `season-subtitle-cascade/episode-002.xml` | Same-season subtitle matching | Synthetic episode; equivalent Italian tracks with distinct source stream IDs. |
| `season-subtitle-cascade/episode-003.xml` | Same-season subtitle matching | Synthetic episode; equivalent Italian tracks with distinct source stream IDs. |
| `subtitles/forced.xml` | Forced subtitles | English ASS track marked forced alongside normal subtitle tracks. |
| `subtitles/external-srt.xml` | External SRT | Synthetic episode; external Italian SRT with its Plex stream endpoint. |
| `subtitles/ass-external.xml` | External ASS | External Italian ASS track with `format="ass"` and a stream key. |
| `subtitles/ass-embedded.xml` | Embedded ASS | Embedded Italian and English ASS tracks, including a forced English track. |
| `audio/multiple-audio.xml` | Multiple audio tracks | AAC Japanese audio plus AV1-version Japanese and English OPUS audio. |
| `multipart/multipart.xml` | Multi-part media | Synthetic title represented by two MKV `Part` nodes under one `Media`. |
| `multiversion/multiversion.xml` | Multi-version media | Synthetic episode with HEVC/AAC and AV1/OPUS versions. |
| `extras/parent.xml` | Extras parent | Synthetic feature metadata with two linked extras. |
| `extras/extras.xml` | Extras collection | Two synthetic Plex extras/trailers for the parent item. |
| `hierarchy/series.xml` | Series hierarchy root | Synthetic show metadata and season-level identity. |
| `hierarchy/series-seasons.xml` | Series seasons | Three season records with their original numbers and keys. |
| `hierarchy/season-01-episodes.xml` | Season episode list | Twenty synthetic episode records, including numbering and view state. |
| `collections/collection-order.xml` | Collection order | Four synthetic film members in the order returned by Plex. |
| `playlists/playlist-order.xml` | Playlist order | Twenty-seven synthetic entries in exact Plex order, spanning seasons and media types. |
| `edge/no-subtitles.xml` | No subtitle alternatives | Synthetic feature with one video stream, one audio stream, and no subtitle streams. |
| `playback/chapters-and-markers.xml` | Playback metadata | Five synthetic chapters with thumbnails/timestamps and two credits markers. |

## Cases unavailable in the sampled library

- External WebVTT subtitles were not found in the sampled episode metadata responses.
- SSA subtitles were not found in the sampled episode metadata responses.

No synthetic fixture was created for either unavailable case.

## Sanitization

- Media titles, original titles, summaries, slugs, artwork labels, filenames, cast,
  character, and crew names use synthetic values.
- Plex tokens, token-bearing query parameters, cookies, and credential fields were removed.
- Server identifiers, client identifiers, and numeric media/part/stream IDs use fixture IDs
  where required by the tested relationships.
- IP addresses and hostnames were removed or replaced with `plex.example.test`.
- Profile/account fields were replaced with `[profile-redacted]`.
- Filesystem roots and filenames use `/fixtures/media/fixture-media-<id>.<ext>`.
- The `Media -> Part -> Stream` hierarchy, duplicate tracks, selected/default/forced flags,
  codecs, languages, bitrate, resolution, HDR-related fields, and version/part counts remain.
- Artwork URLs use the reserved example host and synthetic person identifiers.

Raw captures remain outside the repository.

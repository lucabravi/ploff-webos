# Private Plex Fixture Manifest

These fixtures were collected from an authorized local Plex Media Server for private
Ploff development and regression testing.

## Source

- Plex Media Server: `1.43.3.10896-cb3ebc72`
- Requests: `/identity`, `/library/metadata/<ratingKey>`, `/library/metadata/<ratingKey>/extras`,
  `/library/metadata/<ratingKey>?includeChapters=1&includeMarkers=1`, and the
  authorized library container endpoints used for series, collection, and playlist
  ordering.
- Access route: local LAN only; the source address is intentionally not retained.

Media titles, summaries, language names, technical metadata, and file basenames are
preserved intentionally. They are the values under test. This directory must not be
copied to the public repository without an additional content-redaction pass.

## Collected fixtures

| Fixture | Scenario | Representative data |
| --- | --- | --- |
| `server/identity.xml` | Server identity | PMS version and protocol metadata; server identifier removed. |
| `season-subtitle-cascade/episode-001.xml` | Same-season subtitle matching | *Sample Series*, season 1 episode 1; HEVC and AV1 versions, Italian ASS embedded and external, different source stream IDs. |
| `season-subtitle-cascade/episode-002.xml` | Same-season subtitle matching | *Sample Series*, season 1 episode 2; equivalent Italian tracks with different source stream IDs. |
| `season-subtitle-cascade/episode-003.xml` | Same-season subtitle matching | *Sample Series*, season 1 episode 3; equivalent Italian tracks with different source stream IDs. |
| `subtitles/forced.xml` | Forced subtitles | English ASS track marked forced alongside normal subtitle tracks. |
| `subtitles/external-srt.xml` | External SRT | *Sample Series*, season 2 episode 1; external Italian SRT with its Plex stream endpoint. |
| `subtitles/ass-external.xml` | External ASS | External Italian ASS track with `format="ass"` and a stream key. |
| `subtitles/ass-embedded.xml` | Embedded ASS | Embedded Italian and English ASS tracks, including a forced English track. |
| `audio/multiple-audio.xml` | Multiple audio tracks | AAC Japanese audio plus AV1-version Japanese and English OPUS audio. |
| `multipart/multipart.xml` | Multi-part media | *Sample Film 8* represented by two MKV `Part` nodes under one `Media`. |
| `multiversion/multiversion.xml` | Multi-version media | *Sample Series*, episode 1 with HEVC/AAC and AV1/OPUS versions. |
| `extras/parent.xml` | Extras parent | *Sample Film 6*. |
| `extras/extras.xml` | Extras collection | Two Plex extras/trailers for the parent item. |
| `hierarchy/series.xml` | Series hierarchy root | *Sample Series* show metadata and season-level identity. |
| `hierarchy/series-seasons.xml` | Series seasons | Three real Plex season records with their actual season numbers and keys. |
| `hierarchy/season-01-episodes.xml` | Season episode list | Twenty real episode records for season 1, including episode numbers, titles, summaries, and view state. |
| `collections/collection-order.xml` | Collection order | Four *Code Geass* collection members in the order returned by Plex. |
| `playlists/quintessential-quintuplets.xml` | Playlist order | Twenty-seven playlist entries in exact Plex order, including entries spanning seasons and media types. |
| `edge/no-subtitles.xml` | No subtitle alternatives | *Sample Film 5* with one video stream and one audio stream, and no subtitle streams. |
| `playback/chapters-and-markers.xml` | Playback metadata | Five real chapters with thumbnails/timestamps and two credits markers, alongside the complete media stream hierarchy. |

## Cases unavailable in the sampled library

- External WebVTT subtitles were not found in the sampled 137 episode metadata responses.
- SSA subtitles were not found in the sampled 137 episode metadata responses.

No synthetic fixture was created for either unavailable case.

## Sanitization

- Plex tokens, token-bearing query parameters, cookies, and credential fields were removed.
- Server identifiers, client identifiers, GUIDs, and numeric media/part/stream IDs were replaced with deterministic fixture IDs.
- IP addresses and hostnames were removed or replaced with `plex.example.test`.
- Profile/account fields were replaced with `[profile-redacted]`.
- Filesystem roots were replaced with `/fixtures/media/`; media file basenames remain because they are part of the tested metadata.
- The `Media -> Part -> Stream` hierarchy, duplicate tracks, selected/default/forced flags, codecs, languages, bitrate, resolution, HDR-related fields, and version/part counts were preserved.
- The extras parent also preserves a real 4K HEVC Main 10 media version with PGS and SRT subtitle representations.

## Review result

Anti-leak review passed for the captured XML: no `X-Plex-Token`, original LAN address,
private Plex hostname, original filesystem root, or profile field remains. Raw captures
were kept outside the repository and are not part of the fixture directory.

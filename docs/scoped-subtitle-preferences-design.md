# Scoped Subtitle Preferences Design

> **Status note (2026-09-01):** the scoped track/style/timing model below remains current, but local renderer enablement was intentionally simplified after implementation. `renderSrt` and `renderAss` are now **global-only** Settings values. Media/season copies are ignored and normalized away; the advanced editor can change the global values only through explicit confirmation dialogs. Any older wording in this design that implied scoped renderer persistence is superseded by this note and by `docs/settings.md`.

## Goal

Keep server/profile/media selections and subtitle presentation preferences in one deterministic preference model. Explicit version, audio, and subtitle choices made from Detail or Player apply automatically to the current season (or the current movie); subtitle style and offset remain per media unless the editor explicitly applies them to the season.

## Scope and precedence

Subtitle presentation resolves through one cascade:

1. media override;
2. season override, for episodes with a season identity;
3. global Settings defaults.

Player actions never persist global subtitle Settings. Settings remains the only surface that changes global subtitle appearance/rendering defaults. Quick selections use season preferences for episodes and media preferences for movies. Presentation values resolve field by field with settings < season < media precedence, including timing offsets.

`MediaPreferences` owns version/audio/subtitle selection records under a server-and-Plex-Home-profile identity. `SubtitleSeriesOffset` remains the presentation owner, but its v2 record contains sparse profiles keyed by semantic subtitle identity. Existing v1 records are migrated explicitly; a server-only presentation record is adopted once by the active profile and then removed so it cannot leak to another profile.

Reset selection records remain stored as empty objects to distinguish Automatic from a scope that has never been migrated. Legacy file indices are converted to semantic signatures when the matching media profile becomes available; an unavailable index stays pending rather than saving an automatic fallback. Backup preserves both reset records and pending conversions. Detail and Plex playback use `MediaPreferences.resolve` for track selection and fallback; explicit tracks do not replace the global fallback policy.

## Sparse override model

A scoped override may contain only properties that differ from its parent:

- `subtitleSize`
- `offsetMs`
- `subtitleBackground`
- `subtitleEdge`
- a stable subtitle identity anchor (`language`, format/source, title, forced flag, and embedded stream index where applicable)

Presentation profiles use language/format/source/title/forced/index matching rather than Plex stream IDs, so a season profile can resolve an equivalent stream on another episode. Separate profiles remain available when the language or format changes.

Saving media compares the editor draft with `season -> globals`. Saving season compares with globals. Equal values are omitted. Empty media/season overrides are deleted.

## Reset semantics

The editor exposes one `Reset` action that opens a choice dialog:

- reset current media;
- reset current season, only when a season exists;
- cancel.

Reset changes the editor draft/layers only. Persistence happens only after Apply.

Reset media removes the media layer and recomputes the preview from season/global values. Reset season removes only the season layer; existing media exceptions remain. `Apply to season` saves the season draft and removes the current-media values for controls that are applicable in the active renderer state, so the episode follows the new season preference for those fields. Values belonging to disabled local-only controls remain media exceptions and become effective again if that local renderer later owns the pixels.

## Player quick menu

Quick version, audio, and subtitle track selections are automatically season-scoped for episodes and media-scoped for movies. Audio and video selections use semantic identities; physical Plex media/part indexes are never persisted as the new preference. Automatic removes only that field.

The subtitle track selector includes Automatic in addition to Off and concrete tracks. Choosing Automatic removes the current scope's subtitle selection and immediately resolves the Settings fallback. All Detail, Player, Play-button, and queue paths call the same resolver.

Quick size selection writes only the media subtitle-size difference. The advanced Reset action is the canonical way to clear the whole media subtitle presentation override.

An explicit Track change in the advanced editor uses the same selection memory after Apply succeeds. Apply to season changes the season track selection only when the Track field was actually changed; otherwise it propagates applicable presentation/timing fields without turning a runtime fallback into an explicit season preference. Explicit Automatic clears the scope selection, while Off or a concrete track persists that explicit intent. Embedded ASS/SSA may enter the editor for timing and renderer-applicable controls, but its Plex-provided payload is not treated as an editable original ASS document; ASS background/edge are never persisted as applicable style fields.

## Advanced editor draft

When the editor opens it receives:

- effective values;
- media override;
- season override;
- global defaults;
- effective scope label.

Background/edge previews may temporarily apply CSS to the active Player, but Scoped Apply never calls global Settings commit functions. The renderer rows are the deliberate exception: after an explicit confirmation they update the global renderer setting immediately. Cancel restores the pre-editor scoped Player style/playback state but does not undo a confirmed global renderer change.

The approved playback invariants remain unchanged: Apply/Cancel return to the opening point, safe native seek settlement must not turn Direct Play into Direct Stream, and recovery is not reposition.

## Compact layout and navigation

The main controls use a two-column grid:

- Track | Size
- Background | Edge
- Render SRT | Render ASS (global shortcuts)
- Offset | Loop
- Timeline spans both columns
- Footer: Reset | Cancel | Apply to season | Apply

Normal navigation rules:

- arrows always move focus;
- OK activates a choice/toggle or enters edit mode;
- no focused value changes merely because Left/Right was pressed.

Track, Size, Background, and Edge use the existing choice dialog. Render SRT/ASS open explicit global Yes/No confirmation dialogs; Loop toggles on OK.

Offset and Timeline use explicit edit mode, consistent with the existing safe-area calibration grammar:

- OK enters edit mode;
- Left/Right adjusts offset or scrubs timeline;
- OK leaves edit mode;
- Back leaves edit mode first; a subsequent Back cancels the editor.

The view exposes editing state visually and with ARIA without adding a new global navigation convention.

## Scope status

The header shows non-focusable status text describing the effective source:

- global defaults;
- season preferences;
- customized for this media;
- unsaved changes, when the draft differs from persisted layers.

This is informational only and never becomes another control.

## Compatibility constraints

- ES5 / Chrome 53 compatible runtime.
- No new runtime dependency.
- Keep source modules dependency-free.
- Preserve Direct Play/Direct Stream/transcode behavior and existing subtitle renderer safeguards.
- Keep existing backup compatibility and legacy subtitle presentation records readable.
- Work directly on `develop`; no branch/worktree.

# Launch playback from webOS automation

Ploff accepts an optional, versioned `ploff` object in the normal webOS launch
parameters. A paired webOS controller can start a specific video, playlist, or
collection on a previously configured Plex server without navigating with remote
key presses. Ordinary launches without this object keep their existing behavior.

This uses webOS app launching, not Plex Companion, an HTTP listener, or a new
network service. Configure Ploff's server and profile first. Commands cannot sign
in, select a different profile, bypass a PIN, or enable a disabled server.

## Example

With LG's CLI and a previously paired device:

```sh
ares-launch --device my-tv io.github.rhapsodos.ploff --params '{"ploff":{"version":1,"action":"play","requestId":"automation-001","serverMachineIdentifier":"SERVER-ID","type":"item","ratingKey":"12345","resume":true}}'
```

Home Assistant can send the same payload using its existing webOS integration:

```yaml
action: webostv.command
data:
  entity_id: media_player.example_tv
  command: system.launcher/launch
  payload:
    id: io.github.rhapsodos.ploff
    params:
      ploff:
        version: 1
        action: play
        requestId: "automation-001"
        serverMachineIdentifier: "SERVER-ID"
        type: item
        ratingKey: "12345"
        resume: true
```

These are placeholders. `SERVER-ID` is the Plex server's `machineIdentifier`,
not its address. IDs belong to that server and are not portable across servers.
The device pairing and server configuration are outside this protocol.

## Version 1 fields

| Field | Meaning |
| --- | --- |
| `version` | Required integer `1`. |
| `action` | Required string `play`. |
| `requestId` | Required unique ID for one attempt: 1–100 ASCII letters, digits, `_`, `.`, `:`, or `-`. Reuse it only to retry delivery of that attempt. |
| `serverMachineIdentifier` | Required configured server ID: 1–128 ASCII letters, digits, `_`, or `-`. |
| `type` | Required `item`, `playlist`, or `collection`. |
| `ratingKey` | Required digit-only Plex ID, 1–20 characters. Safe non-negative JavaScript integers are also normalized to strings for YAML callers. Prefer strings. |
| `resume` | Optional boolean, defaults to `true`. `false` starts the selected video at zero without a resume prompt. |
| `issuedAt` | Optional Unix milliseconds. Binds the deadline to the caller's attempt start; see below. |

For `item`, the ID must resolve to a movie, episode, or clip. For the other types,
use the playlist or collection ID, not a leaf's ID. Containers reuse the existing
bounded queue and its starting-item/Up Next behavior; `resume` controls the
initially selected leaf's starting position. After that video ends, Up Next
always starts the next item from zero, even if Plex has a saved position.
An explicit zero is passed to the decoder; it must not fall back to the saved
position. For continuous shuffled playback, a controller can pass the ID of
a normal Plex playlist whose items are already shuffled. This does not add
client-side shuffle, arbitrary start indices, name search, audio playback,
pause/seek commands, or a casting protocol.

Unknown fields inside `ploff`, URL/path IDs, tokens, unsupported types, malformed
JSON, fractional IDs and unsafe numeric IDs are rejected. String launch
parameters are limited to 4096 characters. The command uses the active profile's
existing server route and credentials; it never accepts a connection URL/token
or silently switches to another server. Unrelated top-level webOS parameters
are outside the `ploff` object and are ignored by this parser.

## Lifecycle and retries

- Both cold launch (`PalmSystem.launchParams` / `webOSLaunch`) and warm relaunch
  (`webOSRelaunch`) are handled. A cold command waits for credential/server
  readiness and the existing deferred Player loader.
- A launch attempt has a 90-second deadline. With `issuedAt`, it expires no later
  than `issuedAt + 90000`; this lets an outer automation include TV wake time in
  the same budget. Without it, the budget starts when Ploff receives the command.
  Keep controller and TV clocks synchronized; commands dated more than 30
  seconds into the future or already 90 seconds old are rejected.
- Matching retries with the same request ID do not restart playback or extend
  the deadline. Reusing that ID for a different target/resume mode is rejected.
  Deduplication remembers the last 128 attempts in the current app process;
  it is not persistent across process restarts.
- A new request ID supersedes a pending attempt. Async metadata, deferred
  readiness and player-close completions check ownership before starting media.
- Hiding the application after foreground activation, manual key input, or
  application teardown cancels pending work. A successful command leaves normal
  playback alive; later remote input retains its normal behavior.

## Delivery is not playback confirmation

A successful webOS service response confirms launch delivery only. Ploff marks
the command `playing` only after a **new native `playing` event** and matching
leaf ratingKey and server ID. A previous video's playing state cannot confirm a
new command. Playlist/collection confirmation matches the actual selected leaf.

Local application diagnostics are available through
`PloffApplication.instance().commandStatus()` and `window.PloffCommandStatus`:

```json
{"requestId":"automation-001","state":"playing","reason":""}
```

States are `idle`, `waiting`, `loading`, `starting`, `playing`, `error`, and
`cancelled`. Failure/cancellation reasons include `invalid_command`,
`unsupported_parameter`, `expired_command`, `launch_timeout`, `media_unavailable`,
`player_unavailable`, `playback_failed`, `superseded`, `app_hidden`,
`manual_input`, and `app_closed`. These diagnostics contain no tokens, server
addresses, or media titles and are not a remotely exposed status API.

An external automation should separately confirm playback, for example by
matching the server's active session to the expected TV/client and selected
episode. A count of active viewers is insufficient. PMS session visibility may
lag actual video playback: the existing timeline policy suppresses reports below
20 seconds of playback position and reports periodically after that threshold.
This feature does not change that policy or add an outbound callback.

## Validation scope

Automated tests cover protocol validation, readiness, stale native events,
deadlines, duplicate/superseding requests, cancellation, deferred teardown,
server-bound metadata, item resume/restart, and container queue delegation.
An equivalent local build was exercised on a physical LG webOS TV for a direct
episode launch, a warm replacement, and TV-off → wake → episode launch.
Playlist/collection playback and the complete remote/pointer/Back matrix still
need physical-TV acceptance. See [testing.md](testing.md).

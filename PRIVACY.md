# Privacy Policy

Last updated: 2026-07-23

Ploff is an unofficial, open-source client for Plex Media Server. Ploff is
developed independently and is not affiliated with or endorsed by Plex, Inc.

## Data Ploff Accesses

Depending on the features you use, Ploff can access:

- Plex account and Plex Home profile tokens;
- profile names and profile images;
- Plex Media Server addresses and identifiers;
- library metadata, artwork, filenames, and media technical information;
- playback position, watched state, subtitle offsets, and media preferences;
- application settings and navigation preferences.

This information is required to connect to the server selected by the user,
display its library, play media, and preserve application preferences.

## Data Storage

Ploff stores account tokens, cached profiles, server addresses, playback
preferences, subtitle offsets, and application settings locally on the TV.
Plex tokens and cached Plex Home profile credentials are stored in a private,
app-owned webOS DB8 record. The packaged TV app does not store them in browser
`localStorage`. If private DB8 is unavailable, credentials are kept only in
memory for the current session. Server addresses and non-sensitive preferences
remain in application-local browser storage.

Ploff does not operate an analytics service, advertising service, telemetry
backend, or developer-controlled database. The Ploff developer does not receive
the data stored by the application.

## Data Transmission

Ploff communicates directly with:

- the Plex Media Server addresses selected by the user; and
- Plex-operated services when the user chooses to link a Plex account or use
  account-dependent features.

Ploff does not sell user data or share it with advertising or analytics
providers. Data sent to Plex-operated services is governed by Plex's own
privacy policy and terms.

Local HTTP connections remain available for compatibility with legacy TVs. On
an untrusted network, HTTP traffic and authenticated media URLs could be
observed or modified. HTTPS should be preferred whenever it works on the target
TV and server.

## Retention and User Controls

Persisted account tokens and cached Plex Home profiles remain on the TV until the user
selects **Disconnect Plex**, selects **Delete all local data**, clears the
application's data, or uninstalls Ploff. **Delete all local data** also removes
saved servers, settings, media preferences, subtitle offsets, navigation
preferences, and the local client identifier, then restarts onboarding.

Ploff does not retain a separate server-side copy of this information, so the
developer cannot retrieve or delete data stored on a user's TV.

## Children

Ploff does not knowingly collect personal information from children. Access to
libraries and managed profiles is controlled by the user's Plex account and
Plex Media Server configuration.

## Changes

Material changes to this policy will be documented in the repository and in
the release notes.

## Contact

Privacy and support questions can be submitted through the project's
[GitHub issue tracker](https://github.com/lucabravi/ploff-webos/issues).

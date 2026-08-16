# Data Safety Worksheet

This is an internal factual worksheet, not the official LG form. Revalidate it
against the release candidate and copy the answers into the latest Seller
Lounge submission fields.

## Developer-Operated Collection

- Analytics: none.
- Advertising: none.
- Telemetry or crash-report backend: none.
- Developer-operated account or content database: none.
- Sale of user data: none.

## Data Accessed by the App

| Data | Purpose | Stored on TV | Recipient |
| --- | --- | --- | --- |
| Plex account token | Account linking and resources | Yes, private app-owned DB8 | Plex services |
| Plex Home profile token | Server access as selected profile | Yes, private app-owned DB8 | Selected Plex Media Server |
| Profile name and image | Profile selection and active identity | Yes, cached | TV, Plex services |
| Server URI, IP, and identifier | Discovery, connection, and failover | Yes | Selected Plex Media Server |
| Library metadata and artwork | Browse and display the library | Temporary/runtime cache | TV and selected server |
| Filename and technical media data | Playback choices and diagnostics | Runtime | TV and selected server |
| Playback position and watched state | Resume and library state | Server; transient client state | Selected server |
| Subtitle offsets and media preferences | User-selected playback behavior | Yes | TV |
| UI and navigation settings | Personalize the interface | Yes | TV |

## User Controls

- Disconnect Plex removes locally cached account tokens and Plex Home profiles.
- Packaged TV builds never persist credentials in browser `localStorage`; DB8
  failure falls back to session memory only.
- Clearing application data or uninstalling Ploff removes all locally stored
  Ploff data.
- The in-app **Delete all local data** action removes every `ploff.*` local
  record and restarts onboarding.

## Network and Third Parties

- Local and remote Plex Media Server connections are selected by the user.
- Plex account linking and account-dependent features communicate with
  Plex-operated services.
- Local HTTP remains available for compatibility with legacy TVs.
- Ploff does not send data to the Ploff developer.

## Items to Confirm in Seller Lounge

- Whether LG classifies locally processed profile names as Personal Information.
- Whether server IP addresses must be declared as Device Identifier Information.
- Whether playback progress is declared as Content Viewing Information even
  when sent only to the user's own server.
- Countries of processing for optional Plex-operated services.
- Privacy contact and support contact displayed publicly.

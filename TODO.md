# Ploff Roadmap

Ploff should stay fast, remote-friendly, and uncluttered by default. Advanced
features should use progressive disclosure and remain optional.

## In progress

- [x] Show a full-screen Ploff splash while the application is starting.
- [x] Keep separate LAN and remote playback quality preferences.
- [x] Show whether the active Plex route is LAN, Remote, or Relay.
- [x] Show Plex Server recommendations before Recently Added rows.

## Planned

- [ ] Complete the LG Content Store submission workspace, current UX Scenario,
      App Self-Checklist, Data Safety disclosure, and Seller Lounge registration.
- [x] Add an offline-readable privacy policy and full local-data deletion
      action to the app.
- [x] Move packaged-app Plex credentials out of browser `localStorage` into a
      private, app-owned webOS DB8 kind with session-only failure fallback.
- [ ] Publish the privacy policy at a stable public URL for Store submission.
- [ ] Prepare a dedicated Plex QA environment for LG review: a continuously
      available remote HTTPS server, a separate reviewer account/profile, and
      only fictional, original, public-domain, or otherwise licensed media.
- [ ] Document the LG reviewer flow for Plex linking, remote server selection,
      manual-address fallback, playback, seek, resume, audio, subtitles,
      chapters, watched state, and logout; keep all credentials exclusively in
      the private Seller Lounge submission.
- [ ] Complete Store-specific icons, splash artwork, manifest metadata, and
      Beanviser performance validation.
- [ ] Add real TV screenshots for onboarding, Home, media details, and the
      player, plus a short remote-navigation demo.
- [ ] Search and select additional subtitles.
- [ ] Let users reorder or hide Home rows such as Continue Watching, Recently
      Added, and Collections.
- [ ] Add expandable media details for cast, directors, genres, trailers, and
      extras.
- [x] Add advanced filters for year, genre, actor, director, and resolution.
- [x] Add sorting by year.
- [ ] Scope optional preferences to individual viewing profiles.
- [ ] Add an optional Up Next Home row.
- [ ] Export and import application settings.
- [ ] Add an optional data-saver mode for posters and backdrops.

## Compatibility

- Preserve support for the legacy Chromium version shipped by supported LG
  webOS TVs.
- Keep local playback and server access usable when Plex cloud services are
  unavailable.
- Keep the default interface simple enough to use comfortably with a remote.

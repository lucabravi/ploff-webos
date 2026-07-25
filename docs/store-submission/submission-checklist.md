# LG Content Store Submission Checklist

## Seller and Rights

- [ ] Register and verify an Individual or Corporate Seller in LG Seller Lounge.
- [ ] Confirm the public seller name and support contact.
- [ ] Re-check the current Plex trademark guidelines.
- [ ] Include the required Plex trademark attribution.
- [ ] Confirm that all fonts, icons, screenshots, and submission artwork can be
      redistributed.

## Application Package

- [ ] Freeze a release candidate and version.
- [ ] Complete `docs/release-signoff/v<version>.md`.
- [ ] Run `npm run check:deps` and `npm run verify`.
- [ ] Build and inspect the generic IPK from a clean checkout.
- [ ] Confirm the app ID before submission; it cannot be changed after
      publication.
- [ ] Verify packaged icon, large icon, splash background, app color, title,
      description, version, and launch path.
- [ ] Prepare the separate 400 x 400 or larger LG Content Store icon.

## Reviewer Access

- [ ] Create a dedicated Plex account or managed profile for LG QA.
- [ ] Provide a stable remote server containing only licensed or fictional test
      media.
- [ ] Verify login, profile selection, playback, subtitles, resume, and logout
      from an external network.
- [ ] Store credentials only in Seller Lounge, never in git or the IPK.
- [ ] Document fallback behavior when Plex cloud or the test server is offline.

## Privacy and Data Safety

- [ ] Publish a stable URL for `PRIVACY.md`.
- [x] Make the privacy policy reachable from inside the app.
- [x] Add an in-app action that deletes all Ploff local data.
- [ ] Verify that Disconnect Plex removes tokens and cached profiles.
- [ ] Declare account/profile identifiers, IP/server addresses, viewing
      information, and locally stored credentials accurately.
- [ ] Declare that Ploff has no developer-operated analytics, advertising, or
      telemetry backend.
- [ ] Describe direct communication with Plex Media Server and optional
      Plex-operated services.
- [ ] Complete the latest official LG Data Safety and privacy sections.

## Submission Documents

- [ ] Download the latest official LG UX Scenario template.
- [ ] Complete it using `ux-scenario-content.md`.
- [ ] Download the latest official LG App Self-Checklist.
- [ ] Record actual pass, fail, and N/A results without assumptions.
- [ ] Upload the IPK, store assets, UX Scenario, and Self-Checklist.

## Final QA

- [ ] Test first launch from cleared application data.
- [ ] Run `npm run check:lg-ux`.
- [ ] Complete the remote, pointer, wheel, focus, loading, and playback matrix
      in `lg-ux-compliance.md` on a physical LG TV.
- [ ] Test every declared locale.
- [ ] Test SDR and supported HDR media.
- [ ] Measure startup, CPU, memory, and long-running stability with Beanviser.
- [ ] Confirm there are no personal servers, tokens, credentials, or media in
      the package or submission screenshots.

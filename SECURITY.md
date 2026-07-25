# Security Policy

## Supported Versions

Security fixes are provided for the latest published Ploff release. Older
Developer Mode packages should be upgraded before reporting a problem.

## Reporting A Vulnerability

Use GitHub's **Security** tab and private vulnerability reporting. Do not open a
public issue for a suspected vulnerability. Include the affected version, TV
and webOS version, reproduction steps, impact, and sanitized logs when useful.

Never include Plex tokens, authenticated URLs, cookies, PINs, private media
names, or complete server identifiers. A maintainer should acknowledge a report
within seven days when reasonably possible; this is a target, not an SLA.

## Security Model

Ploff is an unofficial client intended for trusted TVs and home networks. The
packaged TV app stores Plex tokens and profile credentials in a private,
app-owned webOS DB8 kind with synchronization disabled. Browser `localStorage`
contains only non-secret preferences and connection metadata. Existing
plaintext authentication records are migrated to private DB8 at startup and
then removed from `localStorage`.

If private DB8 cannot be initialized, Ploff fails closed: credentials remain
available only in memory for the current session and are not persisted in
browser storage. Local browser development uses `localStorage` because DB8 is a
webOS platform API and must not be treated as a production credential store.

Local HTTP is retained for compatibility with legacy TVs. On an untrusted or
shared LAN, metadata, token-bearing image/media URLs, and traffic to an HTTP
Plex endpoint may be observed or modified. HTTPS is preferred when a server
offers a connection that works on the target TV. Browser-native media and image
requests sometimes require a token in the URL because they cannot attach the
Plex authentication header; diagnostics remove authenticated URLs.

GDM responses are treated as untrusted discovery hints. Authenticated server
routes come from Plex account resources, and endpoint identity is checked
without sending a token before a route is selected.

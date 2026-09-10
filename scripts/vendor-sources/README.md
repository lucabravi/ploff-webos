# JavascriptSubtitlesOctopus legacy worker source

`subtitles-octopus-worker-legacy-4.1.0.full.js.gz` is the unmodified legacy worker that Ploff previously shipped, compressed only to avoid duplicating 3.4 MB of generated JavaScript in the repository checkout.

- Upstream component: JavascriptSubtitlesOctopus 4.1.0
- Uncompressed SHA-256: `1a66cce7795fdfa1cee41b60e812f165421874bf54274f16a797d5aa443e92a0`
- Generated runtime targets: `app/vendor/subtitles-octopus-worker-legacy.js` and `app/vendor/subtitles-octopus-worker-legacy.mem`

Regenerate the Ploff-specific worker with:

```sh
npm run build:ass-legacy-worker
```

Verify that the committed worker matches the source/profile transformation with:

```sh
npm run check:ass-legacy-worker
```

The slimming script deliberately leaves the generated libass/FreeType/fontconfig code and its static data values unchanged. It externalizes the Emscripten static-memory initialization image byte-for-byte into the `.mem` asset so Chrome 53 does not have to parse and base64-decode those data as JavaScript. Brotli support used by FreeType for WOFF2 fonts remains in the native payload. The removed Brotli code is only the separate JavaScript decoder used by the upstream worker for manually compressed subtitle files, a path Ploff does not use because local ASS data is supplied as `subContent`.

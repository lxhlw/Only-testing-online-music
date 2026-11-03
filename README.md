# FyMusic

FyMusic is a modern, responsive **Web-only** music player deployed on Cloudflare Pages. The application supports browser playback with HTML5 Audio, an LX Music compatible custom-source runtime, search, playlists, favorites, history, lyrics and a responsive mobile layout.

The project is independent of LX Music Desktop. It implements a compatible custom-source protocol and does not claim to be an official LX Music app.

## Supported platforms

Current desktop and mobile browsers with modern JavaScript, HTML5 Audio, Fetch, CSS and media APIs, including Chromium, Firefox and WebKit/Safari. **Android 4.4, old WebView/Via and the native Android companion are no longer supported.**

## Project structure

- `index.html` — FyMusic app and hash-based navigation.
- `styles.css`, `modern.css`, `src/mobile-shell.css` — responsive UI.
- `src/` — player state, audio, queue, lyrics, search, browser UX and LX source compatibility.
- `functions/api/` — Cloudflare Pages Functions for catalog, lyrics and same-origin music proxies.
- `vendor/forge.min.js` — LX runtime cryptography compatibility.
- `scripts/` — development, security and browser regression tests; **not public website content**.
- `.github/workflows/` — CI verification and release; **not public website content**.

## Development and checks

Requires Node.js 22 and npm 10. The runtime is intentionally framework-light.

```sh
npm install --no-audit --no-fund
npm run build:pages
npm run test:pages
npx wrangler pages dev dist --ip 127.0.0.1 --port 8788
```

The build discovers allowed static files referenced by `index.html` and its local ES modules, and copies their original bytes to **`dist/`**. Cloudflare Functions remain in the root `functions/` folder and are automatically used by Wrangler. The builder writes a `404.html` and a narrowly scoped `_routes.json`: `/api/*` and known former repository asset paths use Pages Functions; normal app HTML/CSS/JS/audio stay on the fast static path. An edge guard returns a branded 404 for historical repository files even while Cloudflare retains old uploaded assets. This is defense in depth; do not remove the explicit static allowlist.

**Never deploy the repository root.** For an approved release the workflow uses:

```sh
npm run build:pages
npm run test:pages
npx wrangler pages deploy dist --project-name only-testing-online-music --commit-hash "$GITHUB_SHA"
```

The Pages project already exists. Do not run this command against production from a feature branch without explicit approval. PRs must pass regression tests, then use a non-production preview for audio, API and publication-scope checks.

## Playback verification

For real-provider acceptance, search **孙燕姿《开始懂了》** and confirm audible playback, requested quality, player time progression, forward and backward Seek, pause/resume, long playback, background/foreground and lockscreen behavior where supported. Do not assume that source resolution, audio clock movement, or a synthetic media fixture proves all external recordings are available.

The default quality selection prefers the highest available, with explicit compatibility-aware fallbacks. Sources and providers may be region-restricted or temporarily unavailable.

## Seamless, confidence-gated listening

If a Kugou recording cannot play, FyMusic searches for high-confidence matching recordings on Kuwo, Migu and NetEase. It also tries the matched platform's own existing trusted resolver if the imported LX source is temporarily unavailable. This runs automatically without a modal, while the playing source is still accurately reflected in the player.

Missing LRC lyrics can be matched against those platforms **without changing a working audio stream**. Matches require exact normalized song and artist, duration within three seconds and no known album conflict. Audio needs both durations; lyrics with a missing duration require a matching album. Metadata is not an audio fingerprint, so unequal recordings are never guaranteed equivalent. Signed media URLs are not stored in logs or the queue, and the quality choice remains user-configurable, not hard-capped to 128k.

Regression tests: `scripts/test-seamless-cross-platform-match.mjs`, `scripts/test-seamless-cross-platform-browser.mjs`, and the read-only live browser probe `scripts/test-seamless-live-sunyanzi-preview.mjs`.

## Privacy and storage

Queue, favorites, history and imported LX sources are stored in the current browser's localStorage; clearing local site data can delete them. Custom LX source scripts execute code inside the Web page and should be imported only from trusted providers. The same-origin media proxy validates target URLs, rejects private network IPs and validates redirect hops, but is not a public open proxy service.

## Release status

**v0.4.33 (2026-11-03)** strengthens cross-platform Kugou recovery based on the user-reported 周杰伦《稻香》 failure. Search the song title first, retry with artist when needed, prefer ±3 second exact matches and then bounded ≤30 second/18% short edits (never for synchronized lyrics); retry up to three same-platform verified candidate recordings before moving to the next platform. Independent Cloudflare Preview verified real KG 03:18 → KW playback, visible album art and 48 timed LRC lines with no modal. Chromium/WebKit, metadata security, playlist, real Preview and production gates must pass. Preserve v0.4.31 as immediate rollback.

Releases must pass the minimum Pages asset allowlist, proxy/SSRF security tests, dual-engine browser regressions, CI and production deployment verification. Real third-party music availability is variable, so real-media diagnostics are reported separately and do not justify claiming a permanent music availability guarantee.

## v0.4.33 media playback UX

Modern Web quality preference now begins with the highest declared quality (including lossless); when a fixed choice is unavailable but downgrade is enabled it tries the best declared lower quality, not hard-coded 128k. Real media encoding and bitrate are never inferred from requested labels. The player separately identifies browser permission denials, interrupted play requests, and unsupported media. A genuine browser permission denial exposes a direct, user-activated resume control; no script can override a user/OS autoplay restriction.

## Project continuity (public-safe checkpoint)

For a fresh development session or context-limit recovery, read:
- [Current verified state and next goal](docs/HANDOFF_CURRENT.md)
- [Append-only operation log](docs/HANDOFF_LOG.md)
- [Every-operation handoff and privacy policy](docs/HANDOFF_POLICY.md)

These files deliberately contain **only public-safe project facts** because this GitHub repository is **public**. They are not private chat archives. Run `node scripts/check-handoff-privacy.mjs` before committing updates. Confidential notes must use a separately verified private repository, not a public branch or PR.

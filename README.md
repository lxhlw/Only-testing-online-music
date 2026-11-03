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

The build discovers allowed static files referenced by `index.html` and its local ES modules, and copies their original bytes to **`dist/`**. Cloudflare Functions remain in the root `functions/` folder and are automatically used by Wrangler. The builder writes an explicit `404.html` to prevent accidental fallback for unknown/repository paths.

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

## Privacy and storage

Queue, favorites, history and imported LX sources are stored in the current browser's localStorage; clearing local site data can delete them. Custom LX source scripts execute code inside the Web page and should be imported only from trusted providers. The same-origin media proxy validates target URLs, rejects private network IPs and validates redirect hops, but is not a public open proxy service.

## Release status

**v0.4.28** is the minimal-asset publication and retired Android 4.4 cleanup release. The previous production baseline was v0.4.27 at commit `586f592dc994b0868886bcb42b1213c3580f278b`. Release v0.4.28 only after immutable preview acceptance and production workflow verification. Keep the v0.4.27 immutable Pages deployment available as the immediate rollback reference.

For historical audit evidence, see the developer-branch document `docs/FYMUSIC_V0427_FULL_PRODUCTION_AUDIT_2026-11-03.md` in `feature/fymusic-playback-verifier`.

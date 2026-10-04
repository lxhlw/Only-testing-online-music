# Only-testing-online-music

A lightweight web music player project for older Android devices.

## Project goal

This project is being built from scratch as a **Web implementation inspired by the workflow of LX Music Desktop**, with a special focus on legacy Android browsers such as the Via browser on Android 4.4.

The project does **not** use WhyMusic and does not modify the L101 Volume Float Android project.

### Core goals

- Primary real-source search test keyword: **成都**
- LX Music-style search, playlists, favorites, history, lyrics, player, and settings
- Import **original LX Music source JavaScript files directly**
- Do not convert an LX source into another plugin protocol
- Provide the standard `globalThis.lx` runtime expected by LX sources
- Keep the original source text unchanged in storage
- Build the browser layer around old-browser constraints first
- Use HTML5 Audio for playback
- Keep the frontend lightweight enough for legacy Android WebView / Via

## Current phase

Phase 4 establishes the per-source LX Runtime and legacy-browser cryptography foundation.

It currently provides:

- Static HTML/CSS/JavaScript with no framework dependency
- Legacy-friendly syntax in the application code
- LX source URL installation
- LX source metadata parsing
- Original source text persistence in localStorage
- A browser-side `globalThis.lx` runtime
- `EVENT_NAMES`, `on()`, `send()`, and the callback-style `request()` entry point
- Initial `buffer` and `crypto` compatibility primitives
- Source initialization reporting
- Same-origin network proxying for source requests
- Automatic source-import fallback: direct URL first, then same-origin `/api/proxy` when direct access fails or times out
- Import transport reporting so the UI identifies whether a source was loaded directly or through the project proxy
- Real Chromium source compatibility testing with actual HTML5 audio playback
- A standalone `legacy-test.html` page for Android 4.4 / Via browser capability checks
- A local, network-independent Audio playback test using an in-memory WAV data URI
- GitHub raw HTTPS and same-origin proxy diagnostics for the Huibq source

### Player library

The main player now has a lightweight persistent local library:

- Playback queue with duplicate protection and manual removal
- Favorites stored on the device
- Recently played history stored on the device
- Playback adds successful tracks to history automatically
- Ending a queued track automatically starts the next queued track
- Saved tracks can be played again after a page refresh
- Library data stays in the browser's localStorage and does not require a framework or server database

The current browser test does more than check JavaScript initialization: it imports the original source, searches for **成都**, requests playback URLs for the first three results, probes the returned media endpoint, and requires actual HTML5 playback to advance for at least 0.5 seconds.

For the physical Android 4.4 device, open **`legacy-test.html` first**. It reports JavaScript, localStorage, Promise, typed-array, XHR, Audio, MP3/M4A capability, viewport, User Agent, project-resource loading results, actual local Audio playback, and separate GitHub raw / project-proxy connectivity diagnostics. Resource and network probes have bounded timeouts so a broken connection does not leave the page stuck indefinitely.

## Real Chromium source test findings

The following results were obtained from GitHub Actions using real Chromium rather than a Node-only VM:

| Source/version | Initialization | Search 成都 | Playback result |
|---|---|---|---|
| huibq/latest.js | PASS | PASS | **PASS — actual HTML5 playback** |
| huibq/1.2.0.js | PASS | PASS | **PASS — actual HTML5 playback** |
| sixyin/1.2.0.js | PASS | PASS | Source reports version closed |
| sixyin/1.2.1.js | PASS | PASS | Source reports version closed |
| sixyin/latest.js | PASS | PASS | Source reports version closed |
| lx/2.js, lx/3.js, lx/4.js, lx/5.js, lx/6.js | PASS | PASS | Playback API returns 502 upstream network errors |
| lx/latest.js | PASS | PASS | Returned QQ endpoint is not playable from the runner |
| flower/1.js, flower/latest.js | PASS | PASS | Playback endpoint returns 404 |
| qdy/9.3.js, qdy/latest.js | PASS | PASS | Returned QQ playback path is unavailable / not playable |
| huanyin/3.js, huanyin/latest.js | PASS | PASS | Playback host DNS resolution fails |
| grass/1.js, grass/latest.js | PASS | PASS | Playback endpoint returns 404 |
| ikun/6.js, ikun/22.js, ikun/latest.js | PASS | PASS | `api.ikunshare.com` returns 502 upstream errors |
| juhe/3.js, juhe/latest.js | PASS | PASS | Returned QQ playback path returns 404 |
| changqing/1.3.0.js, changqing/latest.js | PASS | PASS | `yinyue.haitangw.net` returns 522 origin timeout |

### Interpretation

The current evidence separates **LX runtime compatibility** from **upstream playback-service availability**:

- **Runtime-compatible and actually playable:** Huibq latest and Huibq 1.2.0.
- **Runtime-compatible but upstream service unavailable:** most other tested sources.
- **Source explicitly disabled:** SixYin 1.2.0, 1.2.1, and latest.
- No current failure above has required changing the core LX runtime because initialization and search work for the tested sources.

This distinction is important for the project's older-device goal: a source that imports and searches correctly but whose remote playback service is dead should not be misclassified as an Android 4.4 compatibility failure.

## LX compatibility target

The target contract follows the public LX Music custom-source API documentation:

- `globalThis.lx.version`
- `globalThis.lx.env`
- `globalThis.lx.currentScriptInfo`
- `globalThis.lx.EVENT_NAMES`
- `globalThis.lx.on()`
- `globalThis.lx.send()`
- `globalThis.lx.request()`
- `globalThis.lx.utils.buffer`
- `globalThis.lx.utils.crypto`
- `globalThis.lx.utils.zlib`

The long-term goal is to run ordinary LX custom sources directly. Where a source depends on a browser-incompatible Node/Electron host feature, the project will provide a Web equivalent where technically possible instead of changing the source protocol.

## Legacy browser target

Primary test target:

- Android 4.4.2
- Via browser
- Old Chromium-based Android WebView
- Touch UI
- 800x1280-class tablet screens

Modern APIs are treated as optional. The application shell is intentionally kept dependency-free so the first compatibility layer does not get hidden behind a large framework build.

## License / upstream relationship

This is an independent project. LX Music is the reference project for the compatible custom-source protocol and product workflow; this repository does not claim to be the official LX Music project.

# FyMusic v0.4.27 — Verified Production Release (2026-11-03)

**Status:** RELEASED to Cloudflare Pages production, browser regression PASS, real Flower Kuwo/Migu 4/4 PASS. User explicitly authorized production release on 2026-11-03. Production code was merged once; follow-up diagnostics ran from development branch without mutating production.

## Immutable release and rollback identifiers

- Production app: https://only-testing-online-music.pages.dev/
- Isolated v0.4.27 PR: https://github.com/lxhlw/Only-testing-online-music/pull/107 — merged.
- Release candidate: `ae562ef8ce1c22d85326bfe5a150c1cb38f2ab8b`, 23 audited file changes; no QA self-test endpoints or fixtures.
- **Production main merge commit: `586f592dc994b0868886bcb42b1213c3580f278b`.**
- **Production Cloudflare immutable deployment:** https://eaa30bfb.only-testing-online-music.pages.dev/ (Pages deployment emitted by the successful release job).
- Previous healthy **v0.4.26 rollback commit:** `c9a496ab580fb54775721b93a3944800bcaefc44`.
- Previous successful Cloudflare immutable deployment: https://294f672e.only-testing-online-music.pages.dev/ .
- Baseline production run: https://github.com/lxhlw/Only-testing-online-music/actions/runs/41054815895 .

## Deployment checks

GitHub Actions production release: https://github.com/lxhlw/Only-testing-online-music/actions/runs/41582700309 **completed/success** for exact merge commit `586f592...`.

1. `Modern browser UX + audio + security` verify job **success**.
2. `Publish verified modern site` production job **success**.
3. Wrangler reported `Deployment complete` to Cloudflare Pages and returned immutable URL `eaa30bfb...`.
4. Production `version.json` checked by the job: **`0.4.27`**, same version as checked out main.
5. Browser acceptance against **actual production** Cloudflare Pages URL passed (including modern web, playlist, mobile interaction).
6. Informational upstream diagnostics had several failures (not all external source paths are reliable); these were separately examined rather than presented as all-green source acceptance.

## Important diagnostic false negative and its resolution

The unmodified older `scripts/test-flower-ui-stability-live.mjs` required `runtime.__debugRequests[].url` to contain the raw Flower origin `97.64.37.235`. The v0.4.27 security change in `src/source-manager.js` **intentionally omits URLs, signed headers, source tags and IDs from debug snapshots**, retaining `{method,proxied,category}` instead. The old diagnostic still recorded native playback, seek and post-25-sec continued progress on all attempts, but `originalFlowerRoute=false`, so its final `verified` flag was a false negative.

The diagnostic was updated **on development branch only** to require `category=flower-resolver`, `proxied=true`, and absence of `url`, `proxyUrl`, and `headers` in the debug record; its field is now `sanitizedFlowerResolver`. This **did not modify production** and did not bypass playback assertions.

Read-only real production follow-up: https://github.com/lxhlw/Only-testing-online-music/actions/runs/41583531444 **completed/success**, CI verified production `version.json=0.4.27`, then tested the actual Flower source from fresh Chromium sessions in **2 KW and 2 MG** attempts:

- KW 2/2 **`UI_LONG_AUDIO_AND_SEEK_PASS`**.
- MG 2/2 **`UI_LONG_AUDIO_AND_SEEK_PASS`**, also continued playback 27 seconds past the watchdog milestone.
- All 4: matched song, Flower source selected, sanitized resolver recorded, actual audio started, time progressed, base seek enabled, pointer seek reached, post-seek media time progressed, no audio error; `allVerified=true`.
- This test used a legacy diagnostic song; it is **not** evidence that every third-party source or every track, including 孙燕姿《开始懂了》, works in all regions and all qualities. User independently reported manual preview acceptance.

## Open operational caveats

- Performance/WebKit issue #106 remains open: https://github.com/lxhlw/Only-testing-online-music/issues/106 — sporadic headless WebKit long-frame and Seek/buffering timing signals; user reported manual acceptance but no device-model/performance trace.
- Old informational live diagnostic failures in the production workflow remain relevant for external providers (notably previously deferred Kugou), despite the corrected KW/MG 4/4 confirmation.
- Do not force hidden audio-quality downgrades; support selected sound quality as implemented.
- No support work for obsolete Android 4.4.2 required.

## Rollback and future updates

If a **reproducible** v0.4.27 production regression is reported, preserve failure evidence, compare to baseline immutable URL, then execute a controlled rollback using Cloudflare Pages deployment restoration (if available through deployment permissions) or a regular GitHub revert PR of merge commit `586f592...`, followed by verified `main` deployment of v0.4.26. Never force-rewrite `main`; do not mark rollback done merely because the old immutable URL still exists. Any rollback is an additional production change and must be separately confirmed and validated.

**Release is complete; no additional major release stages remain.**
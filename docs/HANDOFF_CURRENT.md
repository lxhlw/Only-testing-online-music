# FyMusic — Project Handoff / Current State

> PUBLIC-SAFE TECHNICAL CHECKPOINT. This repository is public. Do not add personal data,
> private conversations, credentials, unpublished private file URLs, signed music URLs,
> browser profiles, API secrets, or account identifiers.
>
> Canonical state for a new conversation: read this file, [the operation log](HANDOFF_LOG.md),
> [the handoff/privacy policy](HANDOFF_POLICY.md), `version.json`, and current GitHub
> Actions results. Repository contents and tests are authoritative over old chat claims.

## Snapshot (2026-11-04, Asia/Singapore)

| Field | Verified state |
| --- | --- |
| Project | FyMusic, modern browser-only streaming/music player |
| Code repository | `lxhlw/Only-testing-online-music` (PUBLIC) |
| Main release | v0.4.33, `version.json` |
| Stable release code | v0.4.33; main docs-only baseline `de908fa395c35a85a0a8c53021a814c491356b41` before this checkpoint |
| Official site | `https://only-testing-online-music.pages.dev/` |
| Main CI status | Prior production #41670345575 SUCCESS; latest docs-only #41673691537 FAILED at real Migu playback timeout; browser/security tests passed |
| UI 2.0 development | Desktop and mobile phases 1–2 implemented and verified on draft PR #116 / independent Cloudflare preview only, NOT production |
| Next execution priority | Visual review [phase 2 preview](https://fc82ed4d.only-testing-online-music.pages.dev/?ui2=1), then tablet/light theme accessibility and measured performance; separately diagnose intermittent production Migu test |

### Stage 3 WIP: tablet continuity and CI visual/performance audit (2026-11-04)

- **Branch:** draft PR #116; production remains v0.4.33.
- **Prepared (tests pending):** dark tablet 741–980px compact navigation, floating Dock and split lyrics/cover layout. New Chromium/WebKit audit at 1440/980/820/741/390/320px; sanitized synthetic screenshots and CI requestAnimationFrame interval metrics stored as short-retention Actions artifacts.
- **Status:** NEW stage 3 tests **PENDING**, CI metrics are NOT real-device FPS.
- **Known source blocker:** preview #41677251142 failed the strict real `稻香` recovery test; alternative Kuwo URL resolution errored. UI and playlist regressions passed. Do not mark live audio green.
- **Next:** resolve any layout audit failures; review metrics/screenshots, preserve true audio test errors; update this main checkpoint with verified results. Remaining macro-stages after stage 3: optional light theme, upstream source diagnosis, final acceptance/release.

### Latest project operation: UI 2.0 phase 2, COMPLETED on isolated preview (2026-11-04)

- **Nonproduction preview:** [FyMusic UI 2.0 phase 2](https://fc82ed4d.only-testing-online-music.pages.dev/?ui2=1). Only the opt-in query `?ui2=1` activates it. The official production URL continues on v0.4.33 main.
- **Code:** [DRAFT PR #116](https://github.com/lxhlw/Only-testing-online-music/pull/116), branch `feature/fymusic-ui2-desktop-preview-20261104`. Verified feature SHA `9bc207d78a4691216a24cec5e8463d2f2ab97043`.
- **Phase 1 retained:** desktop dark cinematic now-playing view, artwork-driven ambient layer (clears when closed), floating music Dock, synchronized lyric styling, reduced-motion support.
- **Phase 2 implemented:** same opt-in CSS adds redesigned search/discovery empty state, song rows, playlists and detail, rankings, history/favorites/queue, settings; mobile dark discovery, navigation drawer, search, playlist/list cards, mini floating Dock, cover-first immersive player, responsive reduced-motion styling. All original DOM IDs and music/playlist logic are preserved.
- **Functional boundaries:** No music search/source URL resolver changes, playback-core changes, additional audio elements, extra music fetches or continuous JavaScript animation loops. Visual layer observes existing artwork and media state.
- **Verification:**
  - [Phase 2 Cloudflare preview workflow #41676240585](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41676240585): **SUCCESS** at SHA `9bc207d7`. Chromium and WebKit local + deployed browser checks, desktop 1440px, phones 390px and 320px, view navigation, dark surface styles, no horizontal overflow, art, timed lyrics, play/pause/resume, reduced-motion check.
  - [Full browser/security verification #41676250254](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41676250254): **SUCCESS**.
  - [Playlist regression #41676250284](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41676250284): **SUCCESS**.
  - Public asset allowlist and retained-file 404 protection passed.
  - Real source scenario: failed Kugou `稻香` seamlessly played a Kuwo alternative, lyrics had 48 timed lines and album art loaded. The tested music request was `128k`, **not** a measured codec/bitrate.
- **Preview test failure and fix:** Initial phase 2 run [#41675764216](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41675764216) failed after deploying because `curl | grep -q` produced a SIGPIPE / exit 23 under `pipefail`; stylesheet was fetched. Updated the workflow to save the CSS to a file before grepping, then verified the succeeding run #41676240585.
- **Release:** **PR #116 remains DRAFT; UI 2.0 is NOT merged or deployed to production.** User/device visual sign-off and objective FPS/memory review remain pending.
- **Separate production issue:** The latest documentation-only `main` release workflow [#41673691537](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41673691537) passed baseline browser/security tests but **failed a real Migu song test after timeout**. A previous main release workflow [#41670345575](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41670345575) succeeded. This upstream-dependent failure is **not demonstrated to be caused by UI 2.0**; keep tracked as a production media diagnostic, do not silently ignore.

### Confirmed implementation milestones

1. **v0.4.32**: Cross-platform recovery for Kugou playback failures, including song matching into a playable Kuwo alternative; metadata, cover and timed lyrics recovery. The real preview test on Jay Chou's `稻香` completed with audio playback, cover loaded, 48 timed lyric lines. This proves a specific scenario, **not every song**.
2. **v0.4.32 Pages guard**: [PR #113](https://github.com/lxhlw/Only-testing-online-music/pull/113) added narrowly scoped edge 404 guarding old public repository paths, while regular app assets stay static. Previous `README.md` HTTP 200 exposure gate was cleared after deployment; preview and production checks passed.
3. **v0.4.33**: [PR #114](https://github.com/lxhlw/Only-testing-online-music/pull/114) differentiated `NotAllowedError`, `NotSupportedError` and `AbortError` instead of treating every `audio.play()` rejection as autoplay blocking. Genuine browser policy denial retains the resolved URL and offers a user-gesture resume action. A web page cannot bypass browser autoplay security.
4. **High-quality behavior**: v0.4.33 attempts the highest quality *declared* by the selected source (including lossless); where a fixed quality is unavailable and user has enabled automatic downgrade, selects the best eligible declared quality before 128k rather than forcing 128k. The actual bitrate/codec are **not measured** merely by the request label. Availability is upstream-dependent.
5. **Validated music UI features**: player pause/resume and seek synchronization, album cover rendering, synced lyrics, queue/playlist, and related browser regressions. The production release action #41650815801 completed successfully with deployed-site acceptance. External source success can change with third-party services.

### Hard product constraints / design principles

- Project name: **FyMusic**. Web-only; modern Chromium/Firefox/WebKit on desktop and mobile. Do **not** reintroduce Android 4.4, legacy WebView or native companion work.
- Site must remain **fast and smooth**; no heavy animation framework or expensive continuous effects without measured benefit.
- Preserve existing search, playlists, rankings, favorites, history, artwork, lyrics, queue, transport controls, quality settings, and cross-platform seamless recovery.
- Audio playback success is **verified by actual media progress**, not by receiving a URL. No unsupported guarantees about lossless quality.
- UX priority: automatically recover where a **properly matched** alternative recording is available, without extra dialogs; maintain consistent metadata and synced lyrics.
- New design target: polished cinematic **dark-first** visual identity, mint/teal accent, subtle artwork-driven ambient background, floating mini-player, large album art and animated timed lyrics. Retain a comfortable **light mode**.
- Prefer transform/opacity animation, reduced-motion support, keyboard controls, accessible contrast, and stop visuals when tab hidden.
- The visual prototype has five screens (desktop discovery; desktop immersive player; mobile discovery; mobile now playing; desktop light theme) plus a motion spec. The Figma access reference is deliberately **not publicized here**; locate it using an authorized Figma connection or request access privately.

### Current limitations / outstanding verification

- The v0.4.33 production CI was successful at the baseline commit, but external providers are not permanently guaranteed.
- A screenshot from the prior v0.4.32 UI showed `浏览器阻止自动播放` and 0:00, and fixed `flac32bit` downgrading immediately to 128k. v0.4.33 addresses the rejection classifier and selection policy; real user-device reproduction should still be part of later acceptance.
- The recent Daoxiang live provider fallback still requested **128k** in the tested source configuration; real output bitrate is unmeasured. Higher-quality capability must be verified source by source.
- **UI 2.0 remains draft preview only**: phases 1–2 desktop and mobile CSS are implemented and verified on PR #116, but not released. Human visual approval, measured FPS/memory, tablet 741–980px behavior and complete light-theme rollout remain unfinished.
- The public GitHub handoff is intentionally restricted to public-safe technical facts. No private conversational memory is stored; full confidential backups require a separate PRIVATE GitHub repository.

## Next goal: UI 2.0 visual sign-off, performance and safe rollout

1. Review [phase 2 preview](https://fc82ed4d.only-testing-online-music.pages.dev/?ui2=1) in desktop and mobile: navigation, hero/search, playlist cards, ranking, music library, album art/lyric sizes and mini Dock; collect actionable design feedback.
2. Compare with the five-screen Figma reference **using authorized Figma connection only**, without sharing Figma access URLs or account IDs in this public document. Fix visual gaps via the existing feature draft PR #116.
3. Measure real device animation smoothness, CPU/memory and reduced-motion behavior. Target responsiveness but **do not claim 60 FPS before measuring**; test small phones and the 741–980px tablet band.
4. Implement a coherent optional light theme for UI 2.0, while protecting accessible contrast and system-theme settings. Existing `?ui2=1` flag stays opt-in until approval.
5. Independently diagnose the current production Migu real-playback timeout in [#41673691537](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41673691537). Compare external source reliability and deterministic local fixtures; do not weaken release acceptance merely to make CI green.
6. Re-run Chromium/WebKit desktop/mobile, real-source cover/lyric/recovery, audio seek/pause, security 404, strict dist allowlist and playlist tests after any new code changes.
7. Keep **PR #116 DRAFT** and official v0.4.33 appearance untouched until visual review and acceptance. Update this current state plus append-only log after each meaningful operation; no private data in public GitHub.
## Next chat: recovery procedure

Paste: **“继续 FyMusic。先从 GitHub 仓库 `lxhlw/Only-testing-online-music` 的 `main` 读取 `docs/HANDOFF_CURRENT.md`、`docs/HANDOFF_LOG.md` 和 `docs/HANDOFF_POLICY.md`，核对最新代码和 Actions，然后执行上面下一目标的第一项。每一步先验收、再更新 GitHub 交接记录；严禁上传私人信息。”**

If this document is older than the last code change, inspect the latest commits, PRs and CI to reconcile it before claiming the checkpoint current.

## Reference index

- `README.md` — architecture, setup, product context
- `version.json` and `src/app-version.js` — deploy version
- `scripts/build-pages-dist.mjs`, `scripts/test-pages-dist.mjs` — static allowlist
- `scripts/test-playback-rejection-browser.mjs`, `scripts/test-playback-quality-policy.mjs` — v0.4.33 media behavior
- `scripts/test-seamless-live-daoxiang-preview.mjs` — real provider fallback scenario
- `src/ui2-preview.css`, `src/ui2-preview.js` — UI 2.0 feature branch visual layer; `?ui2=1`
- `scripts/test-ui2-phase2-browser.mjs`, `scripts/test-ui2-phase2-style.mjs` — Phase 2 desktop/mobile acceptance
- `.github/workflows/verify-and-deploy.yml` — release pipeline

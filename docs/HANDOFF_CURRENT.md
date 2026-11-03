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
| UI 2.0 development | Phases 1–3 implemented on draft PR #116; stage 3 baseline verified in isolated preview, polish retest pending; NOT production |
| Next execution priority | Validate UI2 Stage 4 light-theme CI and screenshots; after Stage 4, tackle upstream source reliability, then final sign-off/rollout |

### Stage 4: optional accessible light theme — implementation committed, CI pending (2026-11-04)

- **Stage 3 now closed:** The final stage-3 polish verification [#41681958521](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41681958521) finished **SUCCESS** at `5de9af04`. Main v0.4.33 remains visually unchanged.
- **Stage 4 feature branch:** `feature/fymusic-ui2-desktop-preview-20261104`, [DRAFT PR #116](https://github.com/lxhlw/Only-testing-online-music/pull/116), latest feature commit `d1f6f58c7cc4158fd9343d0cdf1e4fe88940cb90`. No main merge, no production UI 2.0 release.
- **Implemented:** opt-in `?ui2=1&theme=light` daylight palette for search/playlist/ranking/library/settings, desktop/tablet/mobile and immersive Now Playing. Topbar and Settings theme controls are accessible buttons with keyboard/ARIA pressed-state. Preference saved locally and retained after reload, theme query and browser meta color updated. Playback/source/seek/lyric business logic is not modified.
- **Tests added:** `scripts/test-ui2-theme-browser.mjs` runs Chromium+WebKit at 1440/820/390/320px, checks daylight colors and heading contrast >= 4.5, theme change via keyboard and Settings page, persisted selection, reduced motion, no overflow, no additional audio and legacy-page isolation. Screenshot artifacts contain only synthetic clean-browser state.
- **Verification:** [stage-4 preview #41684255301](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41684255301), [browser/security #41684265856](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41684265856), [playlist #41684265845](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41684265845), [privacy #41684265860](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41684265860). At checkpoint, only playlist/privacy have **SUCCESS**, preview and full browser CI **PENDING**. Do not claim stage 4 completed.
- **Unrelated main CI:** Production documentation release [#41682617224](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41682617224) finished **FAILURE**, despite a prior browser/security success; inspect the failed step in the next source reliability task, do not mislabel UI2 regression.
- **Next:** Inspect stage-4 screenshots and test results; fix any failures on PR #116 and update this main checkpoint with exact verified SHA. When stage 4 has passed, **two macro-stages remain**: upstream source reliability and final user-reviewed rollout. Physical-device FPS and manual screen-reader review cannot be claimed from CI.

### Stage 3: tablet continuity and visual/performance evidence (2026-11-04)

- **Scope:** [Draft PR #116](https://github.com/lxhlw/Only-testing-online-music/pull/116), isolated UI2 `?ui2=1` preview. Production stays v0.4.33; no main UI merge.
- **Verified stage 3 baseline:** feature SHA `5e80697bb707e48297ac5ea55c50a92fb1ee3808`. [UI2 Cloudflare workflow #41679764057](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41679764057) **SUCCESS**, including strict real `稻香` recovery, browser layout and source guard; [full browser/security #41679773945](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41679773945), [playlist #41679774062](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41679774062), [handoff privacy #41679774047](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41679774047) also **SUCCESS**.
- **Implemented:** coherent dark 741–980px tablet experience (icon rail, compact mini-player, flexible album/lyrics); UI2 CSS preserved existing music/seek/lyrics/audio semantics. New public-safe screenshot and metrics CI artifact covering Chromium/WebKit at 1440/980/820/741/390/320px; no horizontal overflow, clipped Dock or multiple audio elements detected.
- **CI frame interval sample:** Chromium P95 ~16.7–16.8ms, WebKit P95 ~17ms; 0 of the 12 short-interval samples had a frame over 50ms. This is **CI runner performance only**, not representative physical-device 60 FPS testing; actual-device review still needed.
- **Visual review observations:** Real screenshot review identified overly bright status/quality badges and clipped tablet brand. These were adjusted in opt-in CSS; the current polish revision is `5de9af04fce229c9498f1db268f5c36f52a10e96`, pending a dedicated recheck in [#41681958521](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41681958521). Do **not** claim polish revision tests passed until recorded.
- **External audio reliability:** Earlier preview [#41681089874](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41681089874) failed strict `稻香` recovery because upstream Kuwo URL resolution failed; that is real and must not be silently ignored. Recent production Migu test likewise intermittently fails. Distinguish confirmed UI tests from provider-dependent tests.
- **Status:** Stage 3 layout/audit milestone implemented and proven on the baseline SHA; polish on draft branch pending, and human design sign-off / physical device FPS remain outstanding.
- **Remaining 3 macro-stages:** **1.** Optional accessible light theme and design/real-device polish; **2.** provider reliability/Migu+Kuwo failure diagnosis and robustness; **3.** full regression, explicit design approval and controlled production rollout.

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

## Next goal: Stage 4 completion, then 2 remaining macro-stages to release

1. **Light theme + human design/performance acceptance:** Complete an accessible optional UI2 light mode, review desktop/tablet/mobile screenshots, test keyboard/screen-reader interactions and measure FPS/CPU/memory on real devices (CI rAF is not a device benchmark).
2. **Source reliability diagnostics:** Keep `稻香` Kugou→Kuwo and real Migu cases strict. Investigate upstream musicUrl failures and add reliable diagnostics/appropriate bounded recovery without falsely asserting playback or weakening acceptance tests.
3. **Final production acceptance and rollout:** Check all UI screens, audio state/seek, synchronized lyrics and covers, platform recovery, build allowlist and 404 guard; obtain explicit visual approval, merge PR only after gates pass and verify Cloudflare production with rollback ready.

At this checkpoint, **all three remain**, and the optional UI 2.0 design has **not** shipped to `main`. Every future operation must update CURRENT and the append-only LOG while excluding private data.

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

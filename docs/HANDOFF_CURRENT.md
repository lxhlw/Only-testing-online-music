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
| Stable release baseline commit | `217973faa12b659432a214eeaf88bb1e697c56de` (v0.4.33 code unchanged by UI 2.0) |
| Official site | `https://only-testing-online-music.pages.dev/` |
| Stable release CI | [Modern Web Verify and Deploy #41670345575](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41670345575): **completed / success** |
| Design exploration | Five editable Figma screens + motion guidance; **first desktop UI 2.0 feature preview implemented and tested on isolated branch, not on production** |
| Next execution priority | Review the [UI 2.0 isolated desktop preview](https://821da531.only-testing-online-music.pages.dev/?ui2=1), then refine artwork/dock/accessibility and implement the next search/library/mobile screens without changing audio logic |

### Latest project operation: UI 2.0 desktop preview, COMPLETED and VERIFIED (2026-11-04)

- **Live preview (nonproduction only):** [FyMusic UI 2.0 desktop preview](https://821da531.only-testing-online-music.pages.dev/?ui2=1). Query `?ui2=1` enables the desktop UI. Ordinary URL without it preserves baseline appearance. This is **not** the production site.
- **Code:** [draft PR #116](https://github.com/lxhlw/Only-testing-online-music/pull/116), feature branch `feature/fymusic-ui2-desktop-preview-20261104`, tested branch SHA `1d13ee4f0b8709b4982b23b13eab3b0c5db9bcbf`.
- **Implemented:** desktop cinematic dark palette, dedicated immersive artwork/lyrics layout, floating bottom player Dock, event-driven ambient background reusing already-loaded cover artwork, and `prefers-reduced-motion`. The existing mobile shell is intentionally unchanged.
- **Safety/behavior:** One original `audio` element, unchanged media resolver, quality/seek handlers, lyrics and platform recovery. The new preview visual module only observes existing images and media state, does not send new fetches or run polling.
- **Verification (all SUCCESS on the tested SHA):** 
  - [Isolated Cloudflare Preview #41672796071](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41672796071): built with static allowlist, 404 protection, local and deployed desktop/mobile Chromium+WebKit browser tests, no overflow, cover + lyrics, pause/resume, artwork lifecycle and reduced-motion checks.
  - [Full browser/security CI #41672843044](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41672843044): SUCCESS.
  - [Playlist regression #41672843520](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41672843520): SUCCESS.
  - [Handoff privacy CI #41672843842](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41672843842): SUCCESS.
  - Real-source scenario: Kugou `稻香` failure automatically chose Kuwo alternative, real audio progressed, 48 timed lyric lines and cover loaded. Requested `128k`; actual bitrate not measured.
- **Release state:** UI 2.0 changes remain on a **DRAFT PR**. No merge or production release. The official site stays v0.4.33. Do not claim UI 2.0 as the shipped main UI.
- **Current limitation:** Browser functional checks passed, but final human visual review, performance measurements in normal client devices, future mobile redesign and search/library UI polish are still outstanding.

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
- **UI 2.0 remains isolated feature-preview only**: desktop presentation is implemented and verified in PR #116, not merged. Mobile and search/library visual redesign remain planned.
- The public GitHub handoff is intentionally restricted to public-safe technical facts. No private conversational memory is stored; full confidential backups require a separate PRIVATE GitHub repository.

## Next goal: UI 2.0 visual review and phase 2

1. Open the exact [isolated preview](https://821da531.only-testing-online-music.pages.dev/?ui2=1) on a desktop. Check visual proportions, legibility, artwork, Dock buttons and animations; collect feedback without changing the official website.
2. Compare UI to the five-screen private Figma reference using an authorized design tool; keep private Figma URL out of public GitHub documents.
3. Fix any review issues on feature branch PR #116; re-run browser/security/real-audio validation and update this checkpoint.
4. Next scoped implementation: UI 2.0 search/song list/library presentation and mobile layouts; keep functional playback/search APIs untouched.
5. Measure low-end devices, `prefers-reduced-motion`, keyboard focus and memory; do not claim 60 FPS without measurement.
6. Keep PR draft until user accepts design and all regression gates pass. Production v0.4.33 remains as safe rollback.
7. After **every operation** update current checkpoint and append operation log in GitHub while enforcing privacy screening.

## Next chat: recovery procedure

Paste: **“继续 FyMusic。先从 GitHub 仓库 `lxhlw/Only-testing-online-music` 的 `main` 读取 `docs/HANDOFF_CURRENT.md`、`docs/HANDOFF_LOG.md` 和 `docs/HANDOFF_POLICY.md`，核对最新代码和 Actions，然后执行上面下一目标的第一项。每一步先验收、再更新 GitHub 交接记录；严禁上传私人信息。”**

If this document is older than the last code change, inspect the latest commits, PRs and CI to reconcile it before claiming the checkpoint current.

## Reference index

- `README.md` — architecture, setup, product context
- `version.json` and `src/app-version.js` — deploy version
- `scripts/build-pages-dist.mjs`, `scripts/test-pages-dist.mjs` — static allowlist
- `scripts/test-playback-rejection-browser.mjs`, `scripts/test-playback-quality-policy.mjs` — v0.4.33 media behavior
- `scripts/test-seamless-live-daoxiang-preview.mjs` — real provider fallback scenario
- `.github/workflows/verify-and-deploy.yml` — release pipeline

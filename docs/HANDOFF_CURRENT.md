# FyMusic — Project Handoff / Current State

> PUBLIC-SAFE TECHNICAL CHECKPOINT. This repository is public. Do not add personal data,
> private conversations, credentials, unpublished private file URLs, signed music URLs,
> browser profiles, API secrets, or account identifiers.
>
> Canonical state for a new conversation: read this file, [the operation log](HANDOFF_LOG.md),
> [the handoff/privacy policy](HANDOFF_POLICY.md), `version.json`, and current GitHub
> Actions results. Repository contents and tests are authoritative over old chat claims.

## Snapshot (2026-11-03, Asia/Singapore)

| Field | Verified state |
| --- | --- |
| Project | FyMusic, modern browser-only streaming/music player |
| Code repository | `lxhlw/Only-testing-online-music` (PUBLIC) |
| Main release | v0.4.33, `version.json` |
| Baseline main commit | `e67071ddc755fcc5f37200db892f9a0cb9ac1118` |
| Official site | `https://only-testing-online-music.pages.dev/` |
| Baseline CI | [Modern Web Verify and Deploy #41650815801](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41650815801): **completed / success** |
| Design exploration | Separate FyMusic UI 2.0 Figma file with five editable screens and a motion handoff board; **NOT implemented in source or deployed** |
| Next execution priority | UI 2.0 isolated preview, starting with dark desktop immersive now-playing and player Dock; keep audio behavior intact |

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
- **UI 2.0 is design-only**, with no live code or real animations wired. Do not claim it shipped.
- The public GitHub handoff is intentionally restricted to public-safe technical facts. No private conversational memory is stored; full confidential backups require a separate PRIVATE GitHub repository.

## Next goal: UI 2.0, preview first

1. Inspect source layout contracts in `index.html`, `modern.css`, `src/mobile-shell.css`, `src/app.js` and `src/player-controls.js`; keep the production working-tree baseline.
2. Start an isolated feature branch with **desktop now-playing + floating transport** and dark theme tokens; maintain existing DOM IDs and event hooks.
3. Implement cover-derived ambient effects with bounded work, lyrics motion with correct timestamps, explicit pause/play icon state, responsive sizes and reduced-motion fallback.
4. Expand to search/list/library and mobile. No regression to source, lyrics, actual play progress, seek, autoplay recovery or quality selection.
5. Run local and Cloudflare preview checks: browser UI (desktop/mobile), Playwright audio state, cover/lyrics sync, actual Kugou→Kuwo `稻香` recovery, 404 guard, build allowlist and performance. **Merge only after passing**.
6. After EVERY meaningful operation or milestone, update **this file** and append to `HANDOFF_LOG.md` in the SAME GitHub change, with evidence, remaining work and next action.

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

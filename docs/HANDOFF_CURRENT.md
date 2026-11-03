# FyMusic — Current Project Handoff (Public-Safe)

> Repository is PUBLIC. Keep only sanitized engineering facts. Read HANDOFF_LOG.md and HANDOFF_POLICY.md before each operation. GitHub branch SHA, workflow results and deployed-site behavior override stale notes.

## Snapshot — 2026-11-04 01:40 Asia/Singapore

| Area | Current evidence |
| --- | --- |
| Product | FyMusic, modern browser-only music web app; no Android 4.4 support |
| Production version | v0.4.33 (version.json); UI 2.0 NOT released |
| Production main baseline BEFORE this documentation checkpoint | 600a58e546d4355f7af5626e7d4496763527215f |
| Public production domain | https://only-testing-online-music.pages.dev/ |
| UI 2.0 implementation | Draft PR #116, feature/fymusic-ui2-desktop-preview-20261104, SHA d1f6f58c7cc4158fd9343d0cdf1e4fe88940cb90 |
| Stage 4 automated preview | PASS: https://github.com/lxhlw/Only-testing-online-music/actions/runs/41684255301 |
| Stage 4 full browser/security | PASS: https://github.com/lxhlw/Only-testing-online-music/actions/runs/41684265856 |
| Stage 4 playlist / privacy | PASS: https://github.com/lxhlw/Only-testing-online-music/actions/runs/41684265845 and https://github.com/lxhlw/Only-testing-online-music/actions/runs/41684265860 |
| Production baseline regression | Latest docs-only main run #41685131793 was still IN PROGRESS at this audit; preceding #41682617224 FAILED on real Migu lyric 502, while #41677152725 succeeded |
| Remaining macro-stages | 2: (5) provider reliability; (6) human-approved final release |

## Completed operation: Stage 4 light theme automated verification and screenshot review

- The opt-in UI 2.0 light appearance, theme query and Settings/topbar controls were already committed on draft PR #116. Verification at the EXACT feature SHA d1f6f58c succeeded on preview #41684255301 and full browser/security #41684265856. Playlist #41684265845 and handoff privacy #41684265860 also succeeded. Stage 3 polish preview #41681958521 succeeded at 5de9af04.
- Chromium and WebKit light-mode tests cover widths 1440, 820, 390, 320 pixels; check keyboard toggles, ARIA pressed state, persisted preference, URL theme, reduced motion, no horizontal overflow, one audio element, legacy-page isolation. The measured test heading contrast was 10.81:1 in all eight browser/viewport cases, above the 4.5:1 requirement.
- Preview CI also verified dark UI search/navigation, album/lyric/play-pause behavior and a real Daoxiang Kugou-to-Kuwo source recovery in the tested sample. The reported 128k is a requested label, not verified actual bitrate. No claim of universal source playback.
- CI screenshot artifact fymusic-ui2-visual-audit (ID 13254972843), produced by #41684255301, was retrieved and visually inspected (synthetic clean-browser screenshots only). Desktop, tablet and 390/320px light and dark layouts appear coherent. In the initial 320px screenshot, the floating player visually overlaps the lower part of the discovery card; verify scroll-to-reveal and accessible hit targets before final user approval. This is a visual review observation, not a proved permanent interaction block.
- Separate stage-3 CI rAF samples at 12 Chromium/WebKit viewports reported P95 around 16.7–17ms and zero gaps >50ms in those short CI runs. THESE ARE NOT physical-device FPS, CPU, battery or memory benchmarks.

## Current limitations and unresolved acceptance gates

1. UI 2.0 has not been merged into main or deployed to the production domain. PR #116 remains DRAFT. GitHub reported mergeable=false / mergeable_state=dirty at this audit: resolve conflicts deliberately on the feature branch before any eventual merge.
2. A human still must approve desktop/tablet/mobile visual design, 320px scroll and dock reachability, keyboard navigation and actual screen-reader behavior. Physical-device FPS/CPU/memory measurements are not available. Do not claim these checks passed.
3. The production source pipeline is intermittent. In main workflow #41682617224, real Migu timed-lyrics acceptance failed in scripts/test-migu-lyrics-preview-live.mjs: the test observed HTTP 502, correctId=false and lyricLines=0. This is an actual failed live route assertion; do not assume a root cause without inspecting provider/proxy responses. Browser/security steps in that run passed.
4. Previous Daoxiang live recovery sometimes succeeds and sometimes fails when upstream alternative musicUrl resolution is unavailable (for example preview #41681089874 failed). Preserve strict real playback-progress acceptance and report transient upstream failure explicitly.
5. Main release workflow #41685131793 was still running when checked; re-read its final status at the start of the next operation instead of treating IN PROGRESS as success.

## Next goal — Stage 5: source reliability diagnostics (not yet implemented)

1. Re-read main and PR heads plus latest Actions. Locate the real Migu 502 response boundary (provider endpoint, edge relay or application parsing), classify without recording raw signed media URLs, tokens, cookies, personal headers or response payloads.
2. Add bounded, observable retry and/or correctly matched cross-platform fallback ONLY when supported by source semantics. Do not misrepresent a resolved URL as playing; require media progress and keep existing lyric/artwork consistency.
3. Exercise strict real Migu and Kugou Daoxiang → Kuwo tests across preview and main while also running local deterministic regressions, security/asset 404 checks, playlist, one-audio, seeks and theme cases. Do not remove or soften failing checks merely to get green CI.
4. After Stage 5 is verified, Stage 6 requires explicit design approval, physical-device performance/accessibility evidence, PR conflict resolution, full end-to-end acceptance, controlled release and production verification with rollback readiness.

## Engineering constraints

- Web only; modern Chromium/WebKit/Firefox. Do not revive old Android 4.4 or native applications.
- Preserve search, playlists, ranking, favorites, history, cover, synced timed lyrics, queue, seek, play/pause, quality policy and seamless properly matched source recovery.
- Visual target: responsive modern dark-first cinematic surfaces with optional accessible light mode, floating player, artwork atmosphere, reduced-motion and low visual overhead. Do not introduce expensive continuous effects without measurements.
- Music playback is verified by actual progress; a music URL by itself is not acceptance. Do not guarantee requested 128k or lossless means measured encoded bitrate.
- Use isolated preview/development PR for code changes; do not deploy unapproved UI 2.0. Every operation updates this CURRENT and the history LOG with exact tests, risks, SHA and next objective.
- This public repository and its Git history are world-readable. Never store private chat history, user identities, private design URLs/IDs, account information, secrets, cookies, signed media URLs, browser profiles or local user paths. For confidential continuity, separately provision and verify a PRIVATE repository before writing any confidential note.

## Next chat — recovery in a fresh conversation

Continue FyMusic. Read docs/HANDOFF_CURRENT.md, docs/HANDOFF_LOG.md, docs/HANDOFF_POLICY.md on main of lxhlw/Only-testing-online-music, verify the main and feature branch SHAs and the latest Actions. Follow NEXT execution target and update both handoff documents after a tested milestone. Protect privacy; do not merge UI2 without explicit design acceptance.

## Reference files

- version.json; README.md; src/ui2-preview.css; src/ui2-preview.js; scripts/test-ui2-theme-browser.mjs; scripts/test-ui2-phase2-browser.mjs; scripts/test-ui2-visual-perf.mjs (verify actual file path before accessing); scripts/test-migu-lyrics-preview-live.mjs; scripts/test-seamless-live-daoxiang-preview.mjs; .github/workflows/verify-and-deploy.yml; scripts/check-handoff-privacy.mjs.

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
| Production baseline regression | Latest main #41686835515 FAILED real Migu lyric HTTP 502; #41685131793 SUCCESS; older #41682617224 also FAILED same route |
| Remaining macro-stages | 1: (6) user/device-approved final release; Stage 5 tested source recovery implemented |

### 2026-11-04 — Integrated release candidate passed automated verification (NOT deployed)

- **Final automated integrated RC:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41691565640 **attempt 2 SUCCESS** at `deb461c5d553c5141bce150a63bcc56eeb029d73`. In this exact Cloudflare preview: Chromium/WebKit desktop/tablet/phone UI2 tests, both themes, keyboard/reduced-motion checks, no horizontal overflow, 404 guard, one audio node; real Kugou Daoxiang→Kuwo alternate music progress/cover/timed lyrics and real Migu Sun Yanzi audio progress/55 timed lyrics/cover/pause/resume all passed.
- **Independent integrated CI:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41691576704 full browser/audio/security SUCCESS; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41691576698 playlist SUCCESS. Candidate visuals were generated in clean browsers, artifact #13256519117. Sampled automated title contrast 10.81:1. CI frame gaps are not device performance measurements.
- **Observed flakiness remains:** The exact same integrated run attempt 1 FAILED strict Daoxiang auto-fallback, while direct Kuwo control actually played; attempt 2 passed. Earlier Migu LRC 502 also occurred intermittently. Never claim every third-party track/source will always succeed. Exact high-confidence song metadata, actual audio progress and lyric verification remain mandatory.
- **Release status:** [PR #122](https://github.com/lxhlw/Only-testing-online-music/pull/122) is READY FOR HUMAN REVIEW, not merged. No UI2 production rollout; main production remains v0.4.33. Human visual/screen-reader inspection and physical-device FPS/CPU/memory evidence cannot be substituted by CI. Before release, synchronize version.json/package/src/app-version.js/HTML cache bust parameters, rerun release CI, merge only after visual signoff and verify Cloudflare production. Maintain non-destructive revert rollback; never force push. The separate PR #116 still has conflicts; use the clean integrated PR #122 for review.
- **Remaining milestone:** Source Stage 5 implementation + automated acceptance is complete for tested cases; **Stage 6 production signoff and deployment remain open**. User asked for a single end-to-end execution, but no device-level result or human visual approval was supplied; do not mislabel these as completed.
- **Next actual operation:** Obtain actual-device/visual acceptance of the preview, prepare v0.4.34 version/cache bump on PR #122, verify strict final commit, merge only after gates, confirm production and rollback.

### 2026-11-04 — Stage 5/6 integrated RC tested, production release blocked

- **Integrated candidate:** DRAFT [PR #122](https://github.com/lxhlw/Only-testing-online-music/pull/122), `release/fymusic-stage5-stage6-rc-20261104`, code SHA `deb461c5d553c5141bce150a63bcc56eeb029d73`. It combines UI 2.0 dark/light desktop/tablet/phone preview with Migu lyric retry and bounded same-song Kugou/Migu recovery. `main` still uses v0.4.33 without UI2 integration.
- **Deterministic CI PASS:** [full browser/audio/security #41691576704](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41691576704) and [playlist #41691576698](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41691576698) passed on exact RC SHA. Preview browser checks in [#41691565640](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41691565640) checked Chromium/WebKit responsive 1440/980/820/741/390/320, theme persistence, keyboard/reduced motion, one audio node, security 404, stable CI frame-interval samples and published synthetic screenshots (artifact 13256519117). CI metrics are NOT device FPS/CPU/memory.
- **Real-source evidence:** A prior [Migu+Daoxiang isolated preview #41690937874](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41690937874) logged **real Migu Sun Yanzi audio progress, artwork, pause/resume and 55 timed lyric lines** and **real Daoxiang KG→KW playback with artwork and 48 timed lyrics**, but its overall run was cancelled after those pass lines due branch updates. The first integrated RC preview #41691565640 **FAILED** strict real Daoxiang fallback; its **real Migu media + 55 timed LRC gate PASSED** in the same preview. Direct Kuwo control subsequently played successfully, while the original selected KG fallback did not. Repeat strict run attempt #2 was started; do not assume final success before checking it.
- **Do not weaken song matching or test media progress:** The original Kugou selection was 198 seconds, whereas the direct playable Kuwo control selected a different recorded length. Song title/artist alone cannot justify blind substitution. Diagnose candidate metadata and retry order with sanitized source/quality/status counts, not raw signed URLs.
- **Unresolved release gates:** PR #116 remains draft and conflicts with main; PR #122 is mergeable but still draft. Real Daoxiang acceptance was failing at first RC attempt, real physical-device FPS/memory and manual screen-reader/visual signoff are not available. Hence **NO production merge**, no UI2 default-enable, no claim that both macro-stages are fully completed. Keep main v0.4.33 production rollback baseline.
- **Next:** Recheck PR #122 rerun #41691565640 attempt 2. If Daoxiang fails, fix candidate identification/recovery without false equivalence or relaxing tests, repeat live Migu/Daoxiang + all CI. Then require real-device a11y/performance and user design acceptance; bump version/cache assets, merge controlled release, verify Cloudflare production and retain a rollback SHA.

### Stage 5A: source-reliability patch committed on isolated branch (2026-11-04)

- **Development branch only:** `fix/fymusic-migu-lrc-bounded-retry-20261104` based on main `4527495d0b50`. Official production remains v0.4.33; UI2 PR #116 stays draft/unmerged.
- **Implemented:** The allowlisted Migu lyric edge handler now retries once, only on transient upstream 429/500/502/503/504 or fetch/timeout failures. Each attempt is deadline-limited to 4.25 seconds; redirects, invalid destinations, malformed lyrics and oversized responses are not retried. No proxy-host widening and no playback-core change.
- **Diagnostics:** Fixed reason enums plus bounded attempt count on failure; raw CDN URLs, upstream response bodies, request query strings and exception messages are not returned. The strict live Migu test records only the safe category while still requiring real timed lyrics, advancing audio, artwork and pause/resume.
- **Tests implemented:** Unit coverage for 503-to-200 recovery, repeated 502 capped at two fetches, non-transient 404 single attempt, exception-message redaction, existing URL validation and response-size guards.
- **Verification:** Deterministic Migu LRC unit and privacy check PASSED in isolated preview #41689359962. This deployed preview reached the real Migu audio-progress gate, implying the strict LRC API checks (HTTP 200, correct source/id, >=10 timed rows) had passed first, but failed after 35s with no confirmed media progress. **This is NOT complete music playback recovery.** Source errors remain independent of UI 2.0. New safe media-state diagnostics and independent real Daoxiang test have been added; retest CI PENDING. Main #41686835515 FAILED real Migu lyric HTTP 502, whereas #41685131793 SUCCESS.
- **Next:** Inspect PR checks and real-Migu outcome; fix any discovered failures. Then continue exact-match Kuwo recovery and source reliability, and only afterward final design/physical-device acceptance and production release.

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

## Next goal — Stage 6: visual/device signoff and controlled production rollout

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

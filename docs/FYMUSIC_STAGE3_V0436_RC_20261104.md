## Stage 4.2B final actual UI preproduction readiness (2026-11-05)

- [x] Exact code `5d2ce2d483b9a701a27cb6541a0a8bfe6e635ee1` [strict Preview #41874004682](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41874004682) SUCCESS, current v0.4.36 versioned assets and safe 404/static allowlist.
- [x] 44 browser screenshot fixtures: Chromium/WebKit, 1440 dark/light focused input/volume mute/unmute and center lyrics >=330px, 16 homepage widths 1440/820/390/320, 12 cross-view and 8 immersive. Full circle no clipping, two-line visible lyric preview, dedicated volume control, no extra audio. [Artifact](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41874004682/artifacts/13346990599) human-reviewed.
- [x] Native actual audio.muted toggle and accessible title, full lyrics via existing overlay on click. Strict unmocked original KG→KW fallback and original MG real audio, loaded cover, 55 timed LRC, pause/resume green in same exact Preview.
- [x] Independent PR modern/browser/security #41874018232, Playlist #41874018049, Privacy #41874018742/#41874004884 all SUCCESS at exact code SHA.
- [ ] Owner reviews [NONPRODUCTION actual UI2 v0.4.36 Preview](https://8a27e03f.only-testing-online-music.pages.dev/) and explicitly approves production release; no such authorization received yet.
- [ ] Controlled nonforce main merge, official Cloudflare v0.4.36 live real source + lyrics + UI/404/seek/classic verification and rollback if needed; official live main remains v0.4.35.

Past upstream transient 502/lrc timeout and KG timed lyric issues are recorded in CURRENT and LOG. Long-term provider reliability, populated real playlist art, physical device FPS/CPU/battery and screen reader remain unverified. This documentation-only checkpoint is separate from the exact tested code and generates new CI.

## Stage 4.1 exact-code final preproduction acceptance (2026-11-05; NOT YET LIVE)

- Verified code HEAD `45f96d93c11636c5683a8e96d11b7ceafba56fed`: [strict isolated Preview #41866987311](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41866987311) SUCCESS. Chromium/WebKit 16 home dark/light/4 viewports + 12 cross-view (Playlist/Ranking/Library, both themes) and 8 immersive synthetic screenshots, classic, safe static 404, keyboard, no dock obscuring; strict original KG→KW fallback and native MG real audio + album + 55 timed LRC + pause/resume PASS. PR browser/security #41867001740 and Playlist #41867001753 SUCCESS. Privacy #41866987093 SUCCESS and second #41867001892 job completed/success (parent workflow status pending).
- Confirmed from **downloaded actual browser screenshot artifact [#13343420887](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41866987311/artifacts/13343420887)** that dark Playlist filters are no longer white and light Ranking empty block is no longer dark; real artwork in populated catalogs was not exercised by offline visual fixture. First Stage 4 run #41861872946 failed MG lyrics upstream HTTP 502; this intermittent source issue remains a deployment risk.
- Current immutable nonproduction v0.4.36 Preview: https://adb161a5.only-testing-online-music.pages.dev/ ; light `?theme=light`. **Official production still v0.4.35, PR #124 DRAFT and unmerged.** Exactly **1 remaining stage**: explicit owner visual/release approval then nonforce merge, official live version/theme/all page and real source/lyrics/security verification + safe revert. No physical-device FPS/CPU/battery/screen-reader checks performed.

# FyMusic v0.4.36 · Stage 3 release-candidate checklist (public safe)

## Status and scope
- **Not production.** Official `main` at the start of this milestone: `a8aafde80e18d76c03952680f7378a8eea93ae1c`, production v0.4.35.
- Candidate: [PR #124](https://github.com/lxhlw/Only-testing-online-music/pull/124), branch `design/fymusic-ui2-atmosphere-20261104`, new version **0.4.36**, release date **2026-11-04**.
- Changes: package/version/app metadata, HTML/app-settings labels, every query-versioned UI2/modern CSS and JS entrypoint, automated consistency checks and immutable Preview version assertions. No modifications to player, source/proxy, lyrics, audio, navigation, playlist state, classic mode or CSS layout from already tested Stage 3.
- Old `?v=0.4.35` references must be absent from both entrypoint HTML files. Version check must reject drift between package, `version.json`, app and HTML. Cloudflare Static Pages build must still exclude scripts, repository docs, workflow files and Android legacy assets.

## Build contract correction (2026-11-04)

Initial v0.4.36 [Preview #41854783706](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41854783706) failed BEFORE preview deployment: the old UI2 contract still required `?v=0.4.35` even though all HTML references had correctly been bumped. The later always-run strict Migu task had no preview URL; this was NOT a real upstream fail. We fixed two UI2 tests to read `version.json` rather than pinning v0.4.35, and aligned the Atmosphere CSS label/style test to v0.4.36. No audio, provider, lyrics or DOM changes; new full exact-SHA CI is pending.

## v0.4.36 exact-code readiness — confirmed

- [x] [Isolated strict Preview #41855336495](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41855336495) success on source HEAD `c5985ef3`, correct v0.4.36 and safe static Pages 404/allowlist.
- [x] Local+deployed Chromium/WebKit 16/16 dark/light desktop/tablet/mobile layout; 8 immersive screenshot fixture cases, one original audio, keyboard/reduced motion and `?ui2=0`.
- [x] **Real unmocked** original KG《稻香》→KW playable; native original MG《开始懂了》 media+loaded art+55 timed lyrics+pause/resume success. Older upstream failures retained as historical risk.
- [x] Independent PR browser/security #41855343685, Playlist regression #41855343551 and privacy #41855343553/#41855335973 success.
- [x] Downloaded and directly viewed [24 screenshot PNGs](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41855336495/artifacts/13337537326); visual layout intact, v0.4.36 shown. Local immersive cover is a deterministic white 1×1 fixture, not real album art.
- [ ] Explicit owner aesthetic/release approval, official production merge and live regression (NOT DONE).

[Immutable nonproduction v0.4.36 Preview](https://a43bc825.only-testing-online-music.pages.dev/) · [Light theme](https://a43bc825.only-testing-online-music.pages.dev/?theme=light). This docs-only checkpoint creates new pending CI separately. **One remaining step** is production deployment and verification after explicit user authorization.

## Exact-SHA prerelease acceptance
- [ ] Original isolated [Atmosphere RC workflow](https://github.com/lxhlw/Only-testing-online-music/actions/workflows/fymusic-ui2-atmosphere-rc.yml) **COMPLETED/SUCCESS at exact v0.4.36 commit**, confirm versioned CSS/JS and no official production deployment.
- [ ] Local and deployed Chromium/WebKit × 1440/820/390/320 × dark/light: 16/16 homepage, 8 immersive screenshots, one audio, card-to-dock clearance, no overflow, touch reachability, keyboard, reduced motion, contrast, classic `?ui2=0`.
- [ ] Original **unmocked** KG《稻香》→KW actually playable; original native MG 孙燕姿《开始懂了》 real audio progress, loaded cover, timed LRC lyrics and pause/resume. Fail and HOLD on upstream HTTP 502/real audio stalls; no mocks, no provider substitution to fake a pass.
- [ ] Independent PR browser/security CI and public-safe handoff privacy both SUCCESS. Verify exact `main` and PR head SHAs before approval.
- [ ] Owner reviews dark/light candidate visuals and explicitly authorizes production release. Physical device FPS/CPU/battery, actual screen reader and third-party provider long-term uptime have NOT been verified.

## Final remaining step (NOT EXECUTED)
1. Upon explicit production approval **and** clean exact-head gates, merge PR via non-force GitHub merge. Do not force-push or deploy a feature branch to the official URL.
2. Let official `verify-and-deploy.yml` verify before Cloudflare Pages production deployment. Confirm official https://only-testing-online-music.pages.dev/ reports **0.4.36**, expected CSS/JS query strings, correct entrypoint and Pages 404 protection.
3. Live acceptance of both themes at desktop/320px, now-playing overlay and seek/pause/resume, classic `?ui2=0`, original KG→KW fallback and native MG actual playback/cover/synchronized lyric; preserve exact run and URLs in GitHub handoff.
4. On a critical regression, revert the merge with a new commit (no history rewrite), run tests and redeploy known-good v0.4.35. Verify official site state after rollback.

## Historical evidence
- Previous pre-bump candidate [Preview #41852903774](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41852903774) and [PR browser #41852918815](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41852918815) succeeded. They **do not** prove v0.4.36 is good.
- Previous external MG intermittence (HTTP 502 LRC / 35s media stall) was separately reported; retain strict original-source release checks.

This document contains only public engineering facts. Never store credentials, signed playback URLs, private account data, or screenshots of private dashboards in this repository.

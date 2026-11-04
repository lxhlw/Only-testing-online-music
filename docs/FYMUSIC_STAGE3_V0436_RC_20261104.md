# FyMusic v0.4.36 · Stage 3 release-candidate checklist (public safe)

## Status and scope
- **Not production.** Official `main` at the start of this milestone: `a8aafde80e18d76c03952680f7378a8eea93ae1c`, production v0.4.35.
- Candidate: [PR #124](https://github.com/lxhlw/Only-testing-online-music/pull/124), branch `design/fymusic-ui2-atmosphere-20261104`, new version **0.4.36**, release date **2026-11-04**.
- Changes: package/version/app metadata, HTML/app-settings labels, every query-versioned UI2/modern CSS and JS entrypoint, automated consistency checks and immutable Preview version assertions. No modifications to player, source/proxy, lyrics, audio, navigation, playlist state, classic mode or CSS layout from already tested Stage 3.
- Old `?v=0.4.35` references must be absent from both entrypoint HTML files. Version check must reject drift between package, `version.json`, app and HTML. Cloudflare Static Pages build must still exclude scripts, repository docs, workflow files and Android legacy assets.

## Build contract correction (2026-11-04)

Initial v0.4.36 [Preview #41854783706](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41854783706) failed BEFORE preview deployment: the old UI2 contract still required `?v=0.4.35` even though all HTML references had correctly been bumped. The later always-run strict Migu task had no preview URL; this was NOT a real upstream fail. We fixed two UI2 tests to read `version.json` rather than pinning v0.4.35, and aligned the Atmosphere CSS label/style test to v0.4.36. No audio, provider, lyrics or DOM changes; new full exact-SHA CI is pending.

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

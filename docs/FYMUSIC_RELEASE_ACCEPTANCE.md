# FyMusic — Release Acceptance History (Public-Safe)

## Current v0.4.35 acceptance — 2026-11-04T20:32:15+08:00

- **OFFICIAL v0.4.35 DEPLOYED and green on main merge `c879eb6f`.** Exact main [#41827353768](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41827353768) attempt 3 SUCCESS, after attempt 1 cancelled and attempt 2 mandatory native Migu audio progress failed. Run 3 strict Migu `开始懂了` same-platform audio+cover+55 timed lyrics/pause/resume, deployed browser UI/security and 404/version checks passed. Official homepage defaults to UI2; `?ui2=0` restores classic appearance.
- **Consent:** The authorized release explicitly accepted the absence of real phone 320px touch, actual screen reader and measured device FPS/CPU/memory/battery as **unverified risks**, not passed test cases. Main v0.4.34 code baseline `781c133e`; do not force push. No rollback conducted. Keep monitoring intermittently unavailable music sources.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/123 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41827353768 ; https://only-testing-online-music.pages.dev/ .

## Historical v0.4.34 checklist (archived context, not current release)

**Status (2026-11-04T15:20:45+08:00):** v0.4.34 DEPLOYED, **STRICT REAL Migu production acceptance PASSED on original main runtime SHA** `98b1dfd386d2509f0821ec634ed610c02866f144` in [Actions #41786525697](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41786525697) run attempt 2. Earlier failures preserved; upstream intermittence remains. **UI2 still opt-in `?ui2=1`, NOT homepage-default.** Visual/basic-experience accepted, but physical phone touch, real-screen-reader and physical FPS/CPU/memory remain NOT VERIFIED. No rollback performed.

## 1. Identify the exact reviewed build

- Read the exact PR head SHA, latest completed **success** integrated preview run, and its Cloudflare preview URL. Do not assume an older preview uses latest code.
- Open the latest preview with `?ui2=1` for dark UI and `?ui2=1&theme=light` for light UI. Record only the public preview link/commit SHA in review.
- Confirm the official production homepage remains v0.4.33 until explicit approval.

## 2. Visual and interaction acceptance (manual)

- Desktop (wide), tablet (medium), phone (390px) and *actual narrow 320px viewport/device*: all screens are readable and core search, album details, playlists, history, ranking, settings and playback controls can be reached.
- At 320px scroll discovery content fully: the floating player must not permanently obscure the last suggestion or other focusable buttons. Open mobile drawer, navigate Settings, save settings, toggle both themes and return to music.
- Verify mini dock art and play/pause have distinct states; fullscreen now-playing displays real artwork and synchronized lyrics. Test pause/resume, seek, skip, quality and queue without duplicated audio.
- Check both themes for contrast, legible labels, no horizontal clipping, reduced motion, large-enough touch targets and predictable navigation. Report any obstruction before approving.

## 3. Accessibility and device performance (manual, not CI)

- Keyboard-only flow, visible focus, ESC/drawer/overlay close, tab order, readable names/announcements. Use a **real** screen reader (such as NVDA/VoiceOver) on an available device and test the same controls.
- Use physical modern phone and desktop devices to assess scroll smoothness, animation stutter, responsiveness, CPU/memory and actual FPS under practical playback, search, navigation and lyric use. The short simulated CI frame-gap sample is **not** device FPS.
- Record only summarized outcome: accepted/rejected, browser family, viewport category, generalized FPS/CPU/memory observations, and reproductions free of identifiers. Do not publish serials, screenshots of personal content, account details, tokens or raw device logs.

## 4. Music and release gate

- On the **exact candidate SHA**, require green local/deployed browser/security, privacy, allowlist/404 and playlist CI, and strict real Migu `开始懂了` audio progress, artwork, timed lyric and pause/resume plus Kugou `稻香` same-song safe Kuwo recovery. Upstream can be intermittent; never equate URL retrieval or quality label with actual playback/bitrate.
- Approve the visuals and actual-device/manual accessibility checks explicitly in PR review (a reviewer may use a sanitized yes/no statement).
- Only then recheck mergeability and HEAD, merge reviewed PR #122 without force-push. Verify production version.json/UI/cache assets, official real-source playback, static file 404 protection and user-facing navigation.
- Keep the last stable v0.4.33 commit as revert baseline. On regression, create a non-destructive revert and retest; never rewrite `main` history.

**Signoff status (2026-11-04):** The reviewed v0.4.34 UI2 preview passed preliminary **visual/basic experience acceptance**, including the corrected narrow-screen welcome-card view. This is a limited go-ahead on appearance/usability impressions, **not a declaration of physical 320px tap testing, real screen-reader verification or physical FPS/CPU/memory acceptance**. Those items remain NOT VERIFIED. Production release and rollback exercises have NOT occurred. A separate explicit authorization and current-head checks are required before a controlled main merge. An automated pass does not mark manual device items complete.

## Production rollout audit — 2026-11-04

- GitHub PR #122 exact head `b83ae5a3` merged as `e060b74c`; stable pre-release main baseline `f27f528e`, preserve revert-ready history.
- Cloudflare Pages production v0.4.34 deployment, version metadata, public static asset allowlist and browser/security PASS in #41785369692 attempts 1 and 2.
- Mandatory production live MG acceptance **FAIL**: attempt 1 valid real song but LRC upstream HTTP 502/timeout after 2 source attempts; attempt 2 valid real song but no audio progress within 35s. Neither failure was silently waived; do not claim a completed green release.
- Newly deployed UI2 code remains gated behind `?ui2=1`. Normal homepage still uses prior presentation. Default activation requires separate review, regression and deploy.
- Manual physical screen-reader and device performance results **UNKNOWN / NOT VERIFIED**; preliminary visual approval is not equivalent to these checks.
- Next: restore robust real Migu timed lyric and playback acceptance without mocked substitutions, then complete default UI2 activation and explicit production smoke tests. Preserve rollback baseline; do not force push.

## Production strict re-acceptance checkpoint — 2026-11-04T15:20:45+08:00

- [#41790673511](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41790673511) isolated read-only strict comparison: production and immutable preview both PASS real same-song Migu audio, 55 timed lyrics, artwork and pause/resume. Diagnostic branch `a875f7a4` is unmerged and changes **no** production code.
- [#41786525697](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41786525697) attempt 2 on original main runtime `98b1dfd386d2509f0821ec634ed610c02866f144` **SUCCESS**, including mandatory real Migu playback/lyrics gate, deployed version/asset/404 checks, browser and security. Prior failures still document intermittent source availability; strict rules not weakened.
- **Next remaining technical stage (1):** make UI2 the homepage default with a reversible `?ui2=0` legacy option, verify both paths/themes/desktop/mobile/screen-reader static semantics/actual music and cache/security, then deploy/verify. Unmeasured physical device performance is still NOT VERIFIED.

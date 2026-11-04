# FyMusic v0.4.34 — Human Release Acceptance Checklist (Public-Safe)

**Status:** PROVISIONAL VISUAL/BASIC-EXPERIENCE ACCEPTANCE RECORDED (2026-11-04); **FULL RELEASE NOT APPROVED / NOT DEPLOYED**. Current reviewed PR #122 candidate commit `b83ae5a3a1a576c7f934f771a8b8ab5c58c5c780`. This checklist documents test categories and results, not unverified device performance.

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

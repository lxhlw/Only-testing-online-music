## Stage 4.2 — Real website search/player product UX (2026-11-05; not live)

A real FyMusic UI2 Preview showed a conflicting inner search focus border, mute-circle focus ring clipped by `overflow:hidden`, and lyric text confined to a very narrow right dock column. In the Stage 4.2 branch code, search focus styling now belongs solely to its outer field; player lyric button moves to a readable two-line center panel that opens the existing immersive lyrics overlay; native mute/volume remain in an unclipped right-side panel. Desktop grid and low-cost gradients enrich the professional look; dark/light, narrow widths, reduced-motion, forced-colors and classic legacy mode are retained. Source/provider/media logic untouched. Chromium/WebKit geometry, real audio mute/unmute, search focus and new screenshots plus exact strict original music gates are **PENDING**. See [PR #124](https://github.com/lxhlw/Only-testing-online-music/pull/124); production still v0.4.35.

## Stage 4.1 — Final real-browser correction QA (candidate, 2026-11-05)

Before correction, actual 36-PNG browser evidence [#13339837999](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41861872946/artifacts/13339837999) showed dark-mode white Playlist filter strips and light-mode dark Ranking empty placeholder. Stage 4.1 `45f96d93` fixes these *real CSS specificity conflicts* and adds browser assertions covering the actual filter colors and `::after` pseudo-element. [Strict isolated Preview #41866987311](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41866987311) SUCCESS and [36 revised real-browser screenshots #13343420887](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41866987311/artifacts/13343420887) visually confirm both corrections in Chromium/WebKit light/dark. Exact source-original KG→KW and MG audio+55 timed lyrics/cover/pause/resume passed; earlier MG 502 remains recorded. Preview https://adb161a5.only-testing-online-music.pages.dev/ is **NOT PRODUCTION**. One final explicitly approved merge/deploy/full live regression remains.

# FyMusic UI 2.0 — Atmosphere Visual Design Candidate (Public-Safe)

## Design intent

Upgrade the existing v0.4.35 music website without changing playback, lyrics, catalog requests, queue identity, accessibility semantics, or audio elements. The baseline already supports desktop/tablet/mobile, both themes, classic escape `?ui2=0`, and a single audio player. The visual opportunity is to improve attention hierarchy without increasing runtime cost.

### Visual principles

- **Musical focal point:** A static CSS vinyl-groove illustration and layered aurora light guide attention to the discovery welcome card. Decorative pseudo-elements are pointer-inert and sit behind controls; desktop only.
- **Contrast and hierarchy:** Stronger headline tracking, refined eyebrow labels and clear focus rings. Homepage and playlist cards have differentiated depth, while secondary rows stay quiet.
- **The player as anchor:** Rich but restrained gradient dock, clearer artwork framing and an accent border during playback. Audio, play/pause, seeking and all existing IDs remain unchanged.
- **Theme coherence:** Dark graphite/emerald and daylight porcelain/jade use the same hierarchy. The classic mode has no new styles because all selectors are scoped under `html.modern-web.fy-ui2`.
- **Performance and access:** No fetched images/fonts, indefinite animations, new event listeners, layout measurement loops, heavy backdrop filters or added media nodes. Hover changes use bounded color/transform transitions; reduced-motion, touch/pointer-coarse and forced-colors overrides are explicit. The 320×640 welcome-card/dock geometry is not changed.

## Changed files / gate

- `src/ui2-preview.css`: appended one independent visual-only `FYMUSIC ATMOSPHERE DESIGN` layer.
- `scripts/test-ui2-atmosphere-style.mjs`: static contract guarding stylesheet scope, themes and low-cost rendering.
- `scripts/test-ui2-atmosphere-browser.mjs`: Chromium/WebKit dark/light at 1440×900, 390×844 and 320×640, checks CSS skin, one audio, overflow, no JS errors and 320px dock clearance; saves synthetic screenshots with a local-only source fixture.
- `.github/workflows/fymusic-ui2-atmosphere-rc.yml`: nonproduction Cloudflare Preview and existing strict unmocked real Kagou-to-Kuwo and original Migu audio/timed lyrics tests. Includes short-lived public-safe screenshot artifact.
- Both handoff documents: new operation checkpoint with accurate pending/verified release state.

## v0.4.36 release-candidate strict verification complete (NOT OFFICIAL)

The exact corrected v0.4.36 code HEAD `c5985ef3` [strict Preview #41855336495](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41855336495) completed SUCCESS, with 16 homepage + 8 immersive Chromium/WebKit dark/light fixtures, source-real KG→KW playback and original native MG real audio, cover, 55 timed lyrics, pause/resume, plus independent PR/security/playlist/privacy checks. [24 screenshots](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41855336495/artifacts/13337537326) were downloaded and examined. White immersive cover is a synthetic 1×1 placeholder, not a real artwork failure. Candidate v0.4.36 [Preview](https://a43bc825.only-testing-online-music.pages.dev/) is nonproduction, public main remains v0.4.35 and PR #124 is still draft. One final merge/deploy/live-audio step remains after explicit approval.

## v0.4.36 candidate release preparation (not deployed)

Release candidate v0.4.36 updates the version metadata and HTML CSS/JS cache identifiers, with strict consistency assertions and dynamic isolated Preview version verification. No player/source/lyrics/proxy runtime code changes. See [release checklist](FYMUSIC_STAGE3_V0436_RC_20261104.md). Full new-SHA tests remain pending; production remains v0.4.35 and PR #124 is draft.

## Stage 3 FINAL design acceptance checkpoint (candidate, not official release)

[Exact source/test commit `3feb2876`](https://github.com/lxhlw/Only-testing-online-music/commit/3feb287679e985757f8a3605470b8ed692259c7a) passed the **entire** [strict isolated Preview #41851542229](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41851542229) on the first attempt, plus independent [PR browser/security #41851554252](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41851554252). Verified 16/16 homepage screenshots, immersive Chromium/WebKit dark/light desktop+phone screenshots (8), 320/820/1440 geometry, all old default/classic/theme/accessibility and asset tests. The strict unmocked original KG `稻香`→KW playable fallback and original native MG `开始懂了` real audio, cover and **55 synchronized lyrics** plus pause/resume PASSED on this candidate attempt.

[24 screenshot PNGs in CI artifact](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41851542229/artifacts/13335596912) were downloaded and visually examined. Immersive test uses a deterministic 1×1 cover placeholder: white/flat square in screenshots is expected fixture content, not a claimed product defect or proof that real album art is missing. That distinction is important when reviewing visuals. Real-source cover loading passed in the separate native-MG test. Latest immutable nonproduction Preview: https://147e84c8.only-testing-online-music.pages.dev/ ; light `?theme=light`.

**Current decision:** Stage 3 candidate design/QA complete, **main remains v0.4.35**, PR #124 still DRAFT. Exactly 2 steps remain: controlled release prep/version-cache + exact-gate tests; then explicitly authorized merge, official deploy/real media verification, non-destructive rollback readiness. Physical device FPS/touch/screen reader and long-term audio-provider reliability are not verified.

## Stage 3 immersive visual QA checkpoint

The exact Stage 3 `6cf8dfc0` [Preview #41847480447](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41847480447) **FAILED** only the original native Migu real audio progression test (song found, no media progression in 35s); Stage 3 16/16 local and deployed Chromium/WebKit homepage/geometry/contrast, real original KG→KW playback, security and separate PR browser gates passed. The [16 synthetic screenshots](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41847480447/artifacts/13336510061) were actually downloaded and inspected: desktop/tablet/phone dark/light home screens stayed clear of floating dock. These do not prove the immersive lyrics view was aesthetically sound.

This follow-up extends `scripts/test-ui2-desktop-browser.mjs` to capture **8 additional immersive screenshots** (Chromium/WebKit × desktop/phone × dark/light) from its existing real local WAV, synthetic album and two timed LRC lines, and to assert album+lyrics columns, no horizontal overflow and preserved theme switching without closing the overlay. The new code is a test-only change; no production app or real audio/lyric-provider tests were modified. New exact-head checks and screenshot review are pending, and the Migu live gate remains mandatory before release.

## Stage 3 — Spatial Music Polish (2026-11-04, candidate only)

Second aesthetic pass on the existing `Atmosphere` branch, requested as a genuine beauty upgrade rather than merely repairing layout. The aim is a distinctive **album-first, cinematic yet quiet** music identity:

- **Discovery hero:** deeper but controlled aurora lighting, brighter song-focused headline, small sculptural note icon, readable left-aligned copy, more tactile music-suggestion chips. The Stage 2 desktop width/height/12px dock clearance remain unchanged.
- **Player dock:** refined translucent-*looking* (but not actually blurred) emerald/slate gradient, subtle border light, premium artwork framing, stronger central play CTA, clean song typography and progress rail. Exactly the same `audio`, seek, mute, pause/next/previous DOM and events.
- **Songs and collections:** consistent low-depth cards with delicate bright borders and responsive fine-pointer hover only; preserve touch behavior, card size, scrolling and existing actions. Product-like visual hierarchy rather than uniform rectangles.
- **Immersive listening:** album-sleeve background with static directional lighting; artwork and active lyric treatment reinforce focus without changing lyric line dimensions or playback timing.
- **Equal-quality light mode:** real opaque background-color (preserves contrast tests), porcelain/jade surfaces and matching green CTA. No copied dark text colors on light surfaces.
- **Performance/accessibility:** all visual art via CSS gradients; no external fonts/images, persistent animated effects, event listeners, `backdrop-filter`, layout recomputation loops or extra audio. Reduced-motion, pointer-coarse and forced-colors respected. Existing 16 Chromium/WebKit 1440/820/390/320 dark/light screenshots and strict original KG→KW/MG media tests retained.

**Risk & release boundary:** Stage 3 is a CSS-only candidate. Browser/style contracts gain checks for the spatial theme, dock elevation and stronger desktop headline hierarchy; this does not claim a new screenshot review, green exact-head CI, physical-device FPS, real screen reader, or production deploy until independently verified. Main remains v0.4.35; draft PR #124 is not authorized for merge.

## Stage 2 final automated verification and screenshot review

Candidate code [`76c2b541`](https://github.com/lxhlw/Only-testing-online-music/commit/76c2b5413104ae30e044c518c6d397561fa208c9) passed [isolated Preview #41843790180](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41843790180) and independent [PR browser/security #41843800517](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41843800517). Both browser engines passed **16/16** dark/light screen layouts (1440, 820, 390, 320); new first-screen hero-width and above-player clearance assertions passed; strict real original KG→KW recovery and original MG audio+cover+timed LRC+pause/resume were successful in this run. The latest [screenshot artifact 13329279643](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41843790180/artifacts/13329279643) was downloaded and visually inspected. The 1440 screenshots now show all suggestion chips and footnote above the player, while 820 and 320 remain unobstructed. This does not constitute real hardware accessibility or performance acceptance.

Production remains **v0.4.35**, no merge. Previous flaky external-Migu failures remain acknowledged, not deleted. Owner approval and a versioned cache/release plan still required.

## Stage 2: human screenshot audit and desktop viewport correction

Actual inspection of the synthetic Chromium/WebKit screenshot artifact [#13329412765](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41842016635/artifacts/13329412765) revealed that the desktop 1440×900 discovery welcome card was too narrow (~437px), resulting in the lower suggestions/footnote being covered by the floating music dock. This had **not** been covered by the initial 12-case automation, which checked only 320px card/dock clearance.

This candidate adds explicit responsive desktop/tablet hero width (up to 950px), compact 246px welcome treatment, left editorial alignment with record groove ornament on the right, without changing mobile dock or player geometry. The browser gate now tests desktop 1440×900 and tablet 820×900 plus mobile 390/320 in Chromium/WebKit with both themes: **16 cases**, including strict card width and above-dock geometry. New HEAD still requires observed verification; screenshots are local-fixture browser samples, not physical-device testing.

## Latest exact-code acceptance status

Final tested visual code HEAD `7df4d72c4eb29d42ed1d0ce632970e299817cffc`: **all 12/12** new synthetic browser design cases, existing Chromium/WebKit light/dark/mobile reachability/keyboard/a11y, one-audio/404/asset restrictions and independent PR browser/security passed. Strict original KG `稻香` real Kuwo recovery also played. Nonproduction immutable Preview: https://945132e1.only-testing-online-music.pages.dev/ ; light `?theme=light`. Synthetic screenshots are attached to GitHub Actions [artifact 13328403131](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41840351705/artifacts/13328403131) and are NOT physical-device results.

**Release blocker:** the same strict Preview workflow [#41840351705](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41840351705) failed twice: attempt 1 upstream MG LRC HTTP 502 timeout, attempt 2 exact native MG song found but audio did not progress within 35s. Neither failure was waived or misclassified as a visual issue. This is a user-reviewable design preview, not a production-approved release. Human visual review, version bump and a later strict native-MG pass remain required.

## Second verification finding

The next [PR browser #41839795150](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41839795150) and [Preview #41839786465](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41839786465) found the same computed-color issue on the **light floating player**. The color contract remained strict; the candidate now sets an opaque white/mint background-color before the gradient background-image in desktop and mobile variants. The new visual test now checks the computed brightness of both search and player surfaces. This remains candidate-only pending exact-head tests.

## First verification finding

Initial candidate CI [#41839250683](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41839250683) caught a light-search CSS computed-color regression: `background` shorthand made the computed base transparent despite a bright gradient. Existing light contrast test **FAILED**, while new 12-case visual matrix **PASSED**. Corrected the light search to explicit white `background-color` plus separate gradient image and added a computed-color assertion to the visual matrix. New exact-head tests remain pending; no claim of public preview or real music pass yet.

**No main release is authorized by creating this design candidate.** Stage remains **IMPLEMENTED / CI PENDING** until exact candidate HEAD screenshots and live tests are verified, then human visual review is needed before controlled deployment. Browser screenshot samples are not actual device FPS/CPU/memory or screen reader evidence.

## Rollback and next targets

Production v0.4.35 remains the reviewed base `a8aafde80e18d76c03952680f7378a8eea93ae1c` (docs-only main HEAD; runtime merge `c879eb6f`). Nonproduction design can be abandoned with no production effect. If reviewing, compare candidate dark and light desktop plus 320px with the official homepage and report clipping, weak contrast, perceived card density, song controls and animation feel; no personal screenshots/logs in public docs.

Next after this focused visual layer: inspect real CI screenshots, resolve observed layout defects only, evaluate album art/lyric immersive view typography, then performance profile on actual modern devices if available.

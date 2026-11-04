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

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

**No main release is authorized by creating this design candidate.** Stage remains **IMPLEMENTED / CI PENDING** until exact candidate HEAD screenshots and live tests are verified, then human visual review is needed before controlled deployment. Browser screenshot samples are not actual device FPS/CPU/memory or screen reader evidence.

## Rollback and next targets

Production v0.4.35 remains the reviewed base `a8aafde80e18d76c03952680f7378a8eea93ae1c` (docs-only main HEAD; runtime merge `c879eb6f`). Nonproduction design can be abandoned with no production effect. If reviewing, compare candidate dark and light desktop plus 320px with the official homepage and report clipping, weak contrast, perceived card density, song controls and animation feel; no personal screenshots/logs in public docs.

Next after this focused visual layer: inspect real CI screenshots, resolve observed layout defects only, evaluate album art/lyric immersive view typography, then performance profile on actual modern devices if available.

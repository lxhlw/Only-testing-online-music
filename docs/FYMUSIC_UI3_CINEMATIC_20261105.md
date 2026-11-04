# FyMusic UI3 — GPU cinematic design and technology roadmap
Date: 2026-11-05 (+08:00) · Public-safe · development only

## Decision
User rejected the previous v0.4.36 visual design despite green functional QA. It was too uniform, insufficiently alive and the 28-column audio meter visibly underreacted. **No v0.4.36 production merge authorized.** Engineering sophistication is a feature, not a reason to simplify the visual design.

## Creative direction (distinct view identities)
- **Search — Aurora/Air:** GPU aurora ribbons, purple/cyan lighting, spatial focus field, softer motion.
- **Playlists — Resonance/Stage:** neon cyan/magenta resonant wavefront arcs, kinetic discovery cards, medium rhythmic motion.
- **Rankings — Velocity/Heat:** amber/coral slanted energy lanes, chart-rank typography, fast and decisive transitions.
- **My Library — Warm/Memory:** dusk amber bokeh, restrained analog vinyl texture, slower drifting atmosphere.
- **Immersive player — Music Nebula:** large album-linked optics, radial audio intensity field, expansive lyric-safe cinematic lighting.

Brand typography, controls and navigation remain consistent; scene color/geometry, animation and content hierarchy MUST differ. This is not five recolorings of a forest wallpaper.

## Architecture and technology
1. Stage A (this source commit): native **WebGL2 GLSL ES 3.00** fragment renderer, per-view shader branches, real pointer parallax, 60fps-capable requestAnimationFrame, DPR-aware sizing, separate immersive shader layer, light/dark modes, context-failure fallback and reduced motion. A WebGPU/WGSL backend may follow with same design API. WebGPU browser availability is not yet universal; WebGL2 is the actual shader baseline.
2. Stage B: rewrite visualizer around FFT 64/96 bands, waveform, RMS, low/mid/high split, adaptive gain, independent attack/release, transient/beat detection, peaks/trails and album-linked shader energy. Native single HTML5 audio player and source CORS must **never be rerouted or silenced**. If third-party audio is opaque, show truthfully unreactive spectrum (but ambient motion can remain independently visible). Do not claim an oscillator fixture proves real provider FFT.
3. Stage C: distinct editorial page layouts, animated ranking TOP3, discovery playlist card systems, tactile library shelf, immersive album/lyrics composition, cinematic View Transitions and WAAPI springs, focus/keyboard/mobile correctness. No UI decoration is allowed to block clicks.
4. Stage D: screenshot review, test on actual browsers, GPU timing, memory/resource profiling, frame-pacing diagnostics, hardware touch and responsive 1440/820/390/320, source/lyrics regression and user visual acceptance. Only then request explicit new-version production authorization.

## Non-negotiable validation
Full Chromium/WebKit, classic opt-out, deep/light, 320px, paused/hidden/reduced-motion state; strict non-mocked KG→KW and original MG audio, cover and 55 timed lines; privacy checks and deploy allowlist. Shader errors cannot blank out page. All preview deploys isolated; no official release without owner approval.

## Risk
Initial Stage A adds GPU rendering and a new look but does NOT solve low-reactivity FFT yet. GPU shader visual quality is not verified until CI screenshots and owner inspection. Real provider FFT may remain unavailable due to cross-origin protection. Physical FPS/battery/real screen-reader remain to be measured.
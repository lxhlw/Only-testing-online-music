# FyMusic Stage 6 — Automated Visual Evidence Review (2026-11-04)

> This is a **public-safe, screenshot-only engineering review** of the nonproduction v0.4.34 candidate. It is not human release approval, an on-device performance audit or a real screen-reader assessment.

## Exact source and status

- Candidate PR: [#122](https://github.com/lxhlw/Only-testing-online-music/pull/122), exact tested SHA `f29b946d41205b7c9e790129014bfa89a2466682`; PR remained open/unmerged and GitHub reported mergeable/clean when checked.
- Candidate isolated integrated CI: [#41776071222](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41776071222) **SUCCESS** at the same SHA. Independent browser/security [#41776077197](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41776077197), playlist [#41776077208](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41776077208), handoff privacy [#41776077220](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41776077220) **SUCCESS**.
- Screenshot artifact: `fymusic-ui2-visual-audit`, artifact ID **13297496074**, attached to integrated run #41776071222; size approx. 1.4 MB ZIP. Contains 11 PNGs and `metrics.json`. Review performed on the actual extracted synthetic images, without accounts or private content. The artifact is retained by GitHub temporarily.
- Current immutable candidate preview: https://4da74e08.only-testing-online-music.pages.dev/?ui2=1 (light: append `&theme=light`). This is **NOT production**. Official v0.4.33 remains live on main.

## Screenshot inventory and observed findings

- Dark search layouts: desktop 1440×900, tablet 980×800, 820×900, 741×900, mobile 390×844 and small-mobile 320×640.
- Light search layouts: desktop 1440×900, tablet 820×900, phone 390×844, small-phone 320×640.
- Additional dark tablet (820×900) library screenshot. This artifact does **not** include screenshots of every feature (e.g., populated lyrics, queue, ranking and settings across all viewports). Do not overstate coverage.
- **Observed:** Search, navigation and player regions look coherent in these synthetic clean-browser screenshots; no obvious broad clipping or unreadable theme mismatch observed in the inspected samples.
- **Specific narrow-screen observation:** In the initial 320×640 search viewport (both themes), the fixed mini player visually overlays the bottom portion of the recommendation card, including its lower footer. The previous exact-head simulated-touch test passed scroll-to-reveal/hit testing across Chromium and WebKit at 320px and 390px, but this does **not** prove physical-thumb ease or screen-reader reachability. Record as **manual visual/interaction review required**, not an established permanent button blocker or an unconditional pass.
- **Sample limitation:** The illustrated player was idle with no personal library or real artwork displayed; visual inspection of actual playing art, lyric scrolling and comments still needs manual review.

## Scoped CI performance evidence

- `metrics.json` records **12** short headless Chromium/WebKit samples across 6 viewport classes: desktop, tablet-large, tablet, tablet-small, mobile and mobile-small.
- Max of reported **P95 frame gap 17 ms**, max individual gap **17 ms**, aggregate samples with >50ms gaps **0**.
- All 12 samples report exactly one native audio node, no horizontal overflow, no dock outside viewport, and dock reduced-motion transition duration `0s`.
- This frame-interval sample is NOT real device FPS, CPU load, memory, battery, thermals, playback smoothness under realistic network conditions or a guaranteed latency target.

## What remains to be done before release

1. **Human/physical-device gate (NOT DONE):** Inspect the exact candidate on real desktop and phone; specifically test small-screen player/card overlap and scroll-to-last-action with fingers, responsive navigation, both themes, actual playing artwork, subtitles/lyrics, queue and seek. Check keyboard and a **real** screen reader. Observe practical physical-device FPS/CPU/memory and animation quality. Record only generalized observations free of identifiers. Obtain **explicit human design and accessibility signoff**.
2. **Release gate (NOT DONE):** After signoff, recheck current candidate HEAD and CI, controlled merge [PR #122](https://github.com/lxhlw/Only-testing-online-music/pull/122) (no force push); verify official v0.4.34, real Migu and Kugou alternate audio progress/cover/timed lyrics, 404/allowlist, and revert-ready previous production baseline. If any gate fails, keep production v0.4.33.

**Conclusion:** Automated visual evidence reviewed; no new runtime change required by these limited samples alone. Human/device acceptance remains pending, so release stays on hold.

## Update: 2026-11-04T13:55:29+08:00 — candidate fix and verified new screenshots

- **Previous observation:** Artifact **13297496074**, tested SHA `f29b946d`, showed the 320×640 dark/light first-screen welcome-card footer underneath the floating player. This remains useful historical evidence, but **does not describe the current candidate screenshot**.
- **Fix:** [`b83ae5a3`](https://github.com/lxhlw/Only-testing-online-music/commit/b83ae5a3a1a576c7f934f771a8b8ab5c58c5c780) scopes smaller welcome-card whitespace/icon/text to UI2 <=360px portrait, height 600–700px; mini dock unchanged. The browser test now requires the card bottom to be **at least 8px above** the dock on initial 320×640 load *without scrolling*, in both Chromium/WebKit and dark/light modes.
- **Results:** [integrated run #41781719596](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41781719596) **SUCCESS** on exact SHA. New screenshot artifact `fymusic-ui2-visual-audit`, **13298609705**, contains updated `ui2-mobile-small-search.png` and `ui2-light-small-phone.png`. Both inspected PNGs show the five suggestion buttons and the entire footer clear of the dock in the initial viewport. 12 synthetic Chromium/WebKit metrics rows report max P95/individual gap 17ms, zero >50ms samples, one audio, no horizontal overflow.
- **Regression evidence:** Same-head full browser/security #41781725591, playlist #41781725549, privacy #41781725539 also **SUCCESS**. Real KG→KW `稻香` recovery and Migu `开始懂了` 55 timed lyrics/audio/cover/pause/resume passed again in #41781719596; all live upstream checks remain subject to intermittence.
- **Current review URL:** https://395bab85.only-testing-online-music.pages.dev/?ui2=1 (light: add `&theme=light`). Previous preview URL is obsolete for reviewing this specific fix.
- **Still not approved:** No physical 320px touch/visual signoff, no real screen-reader report or practical FPS/CPU/memory measurements, no production v0.4.34 release. The CSS fix improves only the tested initial portrait viewport; other screens and playback states remain part of manual acceptance.


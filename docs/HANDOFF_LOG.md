# FyMusic — Handoff Operation Log (Public-Safe)

> Append-only project engineering history. Records start at checkpoint adoption;
> this is **not** a full ChatGPT transcript or a private diary. Read
> [CURRENT](HANDOFF_CURRENT.md) for the latest authoritative state and
> [POLICY](HANDOFF_POLICY.md) for privacy and writing rules.

## 2026-11-05 · UI3 ranking SVG regression fix + strict attempt reconciliation (no production release)

- **Goal:** Recover Stage A Chromium/WebKit screenshot/scene contract and preserve accurate real audio and reduced-motion failures.
- **Changes:** CSS-only `src/fymusic-cinematic.css` fix at `07ab240`: new embedded dark/light ranked energy-lane SVG background beneath intact gradient treatment. No original audio, native player, lyrics, provider or test-threshold changes. This record is a docs-only public-safe checkpoint.
- **Tests:** Previous #41893223192 FAILED computed chart artwork. On exact code `07ab240`, [#41955196501 attempt 1](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41955196501) FAILED overall, despite build/privacy, Chromium/WebKit local browsers, first-fold, isolated Preview and strict KG→KW live audio+48 timed lines all PASS; strict MG original `开始懂了` native audio did not advance in 35s (`readyState:0`). One unchanged-code attempt 2 FAILED local `test-ui2-visualizer-browser.mjs:127` reduced-motion idle sync within 4.5s; Preview was not deployed and MG was NOT actually checked on attempt 2. Tests were not weakened or reclassified.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/commit/07ab240097cfc0ccf122a803d1cf08e642a1e957 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41955196501 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41955196501/artifacts/13383195912 ; immutable nonproduction Preview attempt 1 https://8c92bf9f.only-testing-online-music.pages.dev/ .
- **Visual QA:** 58 actual browser screenshots attached to attempt 1; representative search, playlist, ranking, library dark/light inspected. Distinct GLSL scene patterns are visible, with remaining disconnected rectangular GPU-header composition; aesthetic approval remains pending. No device FPS/memory/battery or screen-reader measurements.
- **Not done:** Prove reduced-motion root cause/fix; pass strict original Migu audio+cover+55 timed LRC; comprehensive screenshot/performance/physical-device acceptance; Stage B FFT, Stage C transitions, Stage D quality, merge, production deploy, rollback drill.
- **Status:** UI3 isolated candidate **HOLD/RED** after two exact-code attempts. Official main v0.4.35 unchanged; old UI2 PR #124 not released. This public docs-only checkpoint will have a NEW head/CI result, initially PENDING.
- **Next:** Diagnose reduced-motion idle race without relaxing assertions; establish real Migu playback; rerun complete isolated Chromium/WebKit/Preview/KG/MG gates; redesign shader integration and then begin Stage B. No production authorization.


## 2026-11-05 · UI3 search header spacing after near-pass first-fold check

- **Goal:** Complete desktop discovery card clearance under original 900px-height player dock contract.
- **Changes:** Desktop Search header margin-bottom 24px→0 only. No user controls/audio/GL fragment changes, other scenes retain spacing.
- **Tests:** Prior #41892785073 card 796.9 vs dock791; required ≤779. New result PENDING. Keep old browser assertion intact.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41892785073 .
- **Not done:** Real WebGL screenshot/Preview, new source KG/MG, advanced audio Stage B.
- **Status:** UI3 candidate layout fix committed, no production release.
- **Next action:** Re-run current head exact CI.

## 2026-11-05 · Decouple GPU cinematic scene from document flow

- **Goal:** Fix reproducible discovery first-fold overlap with dock without cutting shader visual richness.
- **Changes:** Restore baseline view-header sizing in normal flow; paint GPU scene in 170px absolute right-side layer, 110px on narrow screens, with no pointer interception. Keep shader and audio unchanged; new tests target actual scene dimension.
- **Tests:** Prior #41892234308 desktop first-fold FAIL (1054px card vs 791px dock). New exact-head browser/real provider tests PENDING. No regression checks suppressed.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41892234308 .
- **Not done:** New shader screenshot approval, FFT Stage B, transitions Stage C.
- **Status:** UI3 Stage A iteration, nonproduction.
- **Next action:** Check strict current-head CI then screenshot review.

## 2026-11-05 · Correct stale UI3 scene header expectation in static test

- **Goal:** Remove test-only contradiction after intentional desktop first-fold layout fix.
- **Changes:** UI3 style test now checks corrected `min-height:104px` instead of superseded 176px; no player or visual implementation changes.
- **Tests:** Previous #41892017144 failed only that stale assertion before real browser. New exact-head actions PENDING.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41892017144 .
- **Not done:** New GPU browser check, screenshots, Stage B audio redesign.
- **Status:** Static guard corrected, UI3 preview candidate only.
- **Next action:** Inspect new CI and visual evidence.

## 2026-11-05 · Stage A fix proven desktop first-fold overlap and reuse shader context

- **Goal:** Correct actual Chrome/WebKit regression: initial search discovery card hidden behind fixed player after UI3 hero enlargement.
- **Changes:** Compact header geometry and initial search discovery card padding while retaining full GLSL GPU animation; one persistent shader context follows navigation rather than allocating four contexts; strengthen GPU availability test.
- **Tests:** Prior #41891325307 failed old first-fold clearance gate, while initial build/style/privacy succeeded; full new exact-head CI PENDING. No playback API changes.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41891325307 .
- **Not done:** New screenshot/real media pass, Stage B FFT, Stage C transitions.
- **Status:** Scoped visual layout fix prepared on UI3 development branch.
- **Next action:** Observe exact GitHub actions and fix any further proven issues.

## 2026-11-05 · Add UI3 Chromium/WebKit scene and layout screenshot gate

- **Goal:** Prove the five distinct shader scenes actually initialize and render across browsers, themes and mobile widths, not just exist in source.
- **Changes:** Added `scripts/test-fymusic-ui3-browser.mjs` and CI hook; checks view switching, WebGL canvas presence, no body overflow, original single audio, reduced motion, classic opt-out and screenshot artifacts.
- **Tests:** JS parse successful, actual CI/preview PENDING.
- **Evidence:** UI3 branch and isolated workflow.
- **Not done:** CI screenshots, shader aesthetic acceptance, advanced audio Stage B.
- **Status:** Browser QA added without changing production code or live site.
- **Next action:** Check exact-head isolated Actions and screenshots, repair issues.

## 2026-11-05 · UI3 cinematic visual project fork and Stage A GPU renderer

- **Goal:** Implement the user's new demand for sophisticated graphics in every part of FyMusic, and reject old uniform/weakly reactive aesthetics despite green functional tests.
- **Changes:** Created isolated UI3 branch; added render-only WebGL2 GLSL scene engine, five distinct page/immersive shader modes, pointer parallax, light/dark, motion/visibility controls, per-page CSS tokens and card behaviors, UI3 isolated workflow and static contract. Assets explicitly allowlisted; full 4-stage plan added.
- **Tests:** Initial JS source syntax/contract prep, exact source CI and Preview screenshots not yet observed. Old UI2 tests remain historical evidence, not UI3 aesthetic signoff.
- **Evidence:** Branch `design/fymusic-ui3-cinematic-20261105`; `docs/FYMUSIC_UI3_CINEMATIC_20261105.md`.
- **Not done:** FFT responsiveness redesign, View Transitions, screenshot review, physical FPS/battery, original KG/MG new-head checks, production deployment.
- **Status:** Stage A source checkpoint, CI PENDING; main v0.4.35 safe.
- **Next action:** Verify exact new-head UI3 CI and browser-rendered screenshots, fix defects, then implement Stage B real audio visualizer.

## 2026-11-05 · Stage 5.3 full strict preview QA green, 48 screenshots human reviewed; release permission pending

- **Goal:** Finish final visual and cross-platform playback acceptance of the v0.4.36 nonproduction atmosphere + safe spectrum candidate, without weakening existing tests or publishing.
- **Changes:** Reconciled exact PR/source head and all GitHub CI, downloaded 48 actual Chromium/WebKit visual artifact screenshots, inspected desktop Search/Playlist/Ranking/Library in dark/light, 320 responsive and immersive/Canvas visual fixture cases. Verified corrected tall pine silhouette now reads as forest, quiet mountains, vinyl empty state, search/mute/lyrics layout with no obvious clipping in inspected screenshots. This checkpoint updates only public-safe handoff docs; no app/audio/release files changed.
- **Tests:** Source SHA `079d13b9b1abc1f5acfef8729ebabf07b7e12d1f`: #41886155758 strict isolated Preview COMPLETE SUCCESS including local/Preview browser, deterministic 28-bin FFT synthetic oscillator versus static fallback and pause/reduced-motion, real KG→KW playable, real MG audio+cover+55 timed LRC/pause-resume; #41886164163 modern security SUCCESS; #41886164164 playlist SUCCESS; #41886164196/#41886155978 privacy SUCCESS. 48 screenshots artifact #13352521003 visual review completed. Earlier MG #41884752902 FAIL is retained as intermittent source risk and not re-labeled. The new docs-only handoff commit may launch new CI and must be checked separately.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41886155758 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41886155758/artifacts/13352521003 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41886164163 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41886164164 ; https://08aa107f.only-testing-online-music.pages.dev/ .
- **Not done:** User-specific visual preference approval, explicit official production authorization, actual release/production QA, physical device FPS/battery/real screen-reader, long-term third-party uptime and full rollback rehearsal.
- **Status:** v0.4.36 candidate tested in Preview and original audio gates green; live v0.4.35 main unmodified; PR #124 draft/unmerged.
- **Next action:** Ask owner to inspect Preview. Only with distinct explicit production authorization may v0.4.36 be released after fresh preflight; otherwise refine UI in candidate branch.

## 2026-11-05 · Fix Stage 5.3B false forest CSS assertion

- **Goal:** Repair double-escaped regex in newly added style test before relying on CI.
- **Changes:** Use direct CSS substring inspection for scoped navigation pine selector and its fixed 166px height. No runtime code or UI changed.
- **Tests:** Re-executed whole style-contract source via JavaScript on actual retrieved candidate files, PASS; prior erroneous regex check FAIL. New GitHub CI PENDING.
- **Evidence:** Prior pine commit `255254c27d0e1922664e57625b44ef99f6d2a34d`, PR #124.
- **Not done:** exact-head full browser/visual and external MG success.
- **Status:** Test guard repaired, production untouched.
- **Next action:** Verify GitHub Actions; no bypassing real media gates.


## 2026-11-05 · Stage 5.3B screenshot-based pine silhouette correction

- **Goal:** Improve an actually observed design shortcoming: left sidebar scenery looked like grass in desktop 1440 screenshots, rather than visible layered forest matching requested musical ambience.
- **Changes:** Replace two embedded, network-free dark/light SVGs with taller 20-pine compositions and distant hills, maintaining fixed noninteractive nav rail background and existing gentle mist animation. Scale at fixed 166px high instead of nav-width-compressed 100%. Strengthen static CSS contract. No playback, source, lyrics, volume, queue, HTML audio, font requests or UI layout element changes.
- **Tests:** Prior screenshot artifact #13349738917 manually inspected (visual issue confirmed); Stage 5.3 isolated #41883742980 SUCCESS including strict KG→KW & original MG. On latest prior `09d9fca19f`, playlist #41884758923, modern #41884758889, privacy #41884758877/#41884752881 SUCCESS; strict isolated #41884752902 FAILED real MG audio progress (media never started) despite local visual and KG gates green. New pine candidate exact-head CI and screenshots PENDING, no fake pass.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41883742980/artifacts/13349738917 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41884752902 ; https://github.com/lxhlw/Only-testing-online-music/pull/124 .
- **Not done:** New browser screenshot review, strictly passing MG on new head, actual provider frequency capture, physical device FPS/battery/screen-reader, official release or rollback.
- **Status:** Forest visual correction source committed, PR still draft. Official v0.4.35 stable.
- **Next action:** Verify current-head CI/screenshot, investigate MG intermittent failure without weakening assertions, obtain visual and production authorization.


## 2026-11-05 · Stage 5.3 playlist mock media validity correction

- **Goal:** Recover deterministic queue-end test after an invalid synthetic MP3 body could produce background playback errors during final status assertion.
- **Changes:** Replace two empty-body MP3 responses in test-only `scripts/test-playlist-playall-browser.mjs` with valid RIFF/WAV and correct MIME; add inline generated wave bytes. Preserve every actual queue/automatic-paging/last-track assertion, native controls and production implementation. No test relaxation.
- **Tests:** JavaScript async syntax compilation PASS, local fixture RIFF signature assertion inserted. Candidate playlist #41883747190 FAILED with audio-connect status (source-supported mock flaw, not yet confirmed); new exact-head CI PENDING. Preview #41883742980 had passed local Chromium/WebKit and deployed isolated candidate, but remote checks were not completed at last inspection. Privacy #41883746997/#41883743027 passed for prior source.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41883747190 ; https://github.com/lxhlw/Only-testing-online-music/pull/124 .
- **Not done:** New playlist pass, strict live KG/MG on updated head, rendered screenshot manual review, production deployment, physical mobile/audio performance measurements.
- **Status:** Scoped playlist test fixture corrected in draft branch; official v0.4.35 untouched.
- **Next action:** Verify current PR head Actions and artifact, then final owner review and authorized deployment.

## 2026-11-05 · Stage 5.3 deterministic visualizer/browser acceptance checkpoint

- **Goal:** Add deterministic real Canvas/FFT data-path and pause/motion/native-player regressions to the final UI2 validation, without weakening any real-provider gates.
- **Changes:** New Chromium isolated test `scripts/test-ui2-visualizer-browser.mjs` uses native test WAV playback and TEST-ONLY independent oscillator MediaStream capture; tests live 28-bar analyser and static fallback without CORS, single audio, pause frame stop, reduced-motion without audio interruption, dark/light immersive glow and classic opt-out. Added test to existing isolated Preview workflow. Fixed leak on MediaStreamSource construction failure by closing the pending AudioContext before reset; no third-party provider, audio sink, playback API or media URL change.
- **Tests:** Static source contract/parse checks to perform before commit; new exact-head GitHub Actions and actual screenshots **PENDING**. Earlier #41882720466 still IN PROGRESS at initial inspection, not green. Synthetic oscillator test is **NOT** evidence of frequency capture for real providers.
- **Evidence:** Existing [PR #124](https://github.com/lxhlw/Only-testing-online-music/pull/124); original known-good strict music [#41874004682](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41874004682) is historical old code only.
- **Not done:** New CI and screenshot inspection, real-provider spectrum capture coverage, physical phone/CPU/FPS/battery or screen-reader audits, production merge/deploy, final owner sign-off.
- **Status:** Final QA hardening committed, candidate-only; main v0.4.35 untouched.
- **Next action:** Review exact-head Actions and visuals; fix observed issues then seek explicit release consent.


## 2026-11-05 · Stage 5.2 module-ready browser test ordering

- **Goal:** Eliminate a possible race between UI2 presentation initialization and the following separate analyzer module.
- **Changes:** Await `FyMusicUI2AudioVisualizer.spectrumPresent()` in the existing local/isolated Chromium-WebKit tests before asserting Canvas state; no product JS/CSS, player, resolver or lyrics change. No mandatory tests are weakened.
- **Tests:** Source-level sequencing inspected; new exact-head Actions still pending. Prior Preview failures #41880034752 (light library art) and #41881334418 (old UI2 presentation contract) were documented and corrected in earlier source commit; their runs remain FAILED historically.
- **Evidence:** Draft PR #124; prior committed fix `b23cc6dcbcb88701ba3e7dd6b3ecedede26abe03`.
- **Not done:** Fresh Preview, real frequency FFT with capturable audio, physical-device benchmark or production deploy.
- **Status:** TEST READINESS SOURCE CORRECTION; CI PENDING.
- **Next action:** Check current source-head Playwright/security/live-music actions and visual artifacts before release review.


## 2026-11-05 · Stage 5.2 isolate analyser JS to uphold original presentation contract; fix light vinyl

- **Goal:** Correct two proven independent PR Preview failures without relaxing strict CI: light empty-library vinyl hidden by inherited important gradient, and requestAnimationFrame forbidden in the presentation-only UI2 JS file.
- **Changes:** Move unchanged analysis-only Canvas/AudioContext code into newly versioned `src/ui2-audio-visualizer.js`; restore `src/ui2-preview.js` to its presentation-only contract. Add script tag to UI2 app entrypoint, Node parse check in isolated candidate workflow, adjust scoped static test to new module; preserve single `<audio>`. Light empty-list SVG uses explicit important image to supersede existing important gradient. No resolver or playback rewrites.
- **Tests:** Previous Stage 5.1 Preview #41880034752 FAILED actual empty-vinyl computed background; Stage 5.2 #41881334418 FAILED old presentation requestAnimationFrame prohibition at build gate, no actual Preview or live music result from that run. New code checks/CI remain pending at commit; no fake green status. Main remains v0.4.35.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41880034752 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41881334418 ; [PR #124](https://github.com/lxhlw/Only-testing-online-music/pull/124).
- **Not done:** New exact-head browser/strict Preview/visual screenshot verification, real safe FFT across CORS-protected providers, production merge and physical-device benchmark.
- **Status:** Both failure causes addressed at source; new workflow pending, not passed.
- **Next action:** Inspect new CI and screenshots, then Stage 5.3 acceptance and authorized release decision.


## 2026-11-05 · Stage 5.2 style-contract JavaScript syntax fix

- **Goal:** Remove a new test-only JavaScript parse blocker detected in post-commit source audit.
- **Changes:** Replace two incorrectly escaped regex literals in `scripts/test-ui2-atmosphere-style.mjs` with explicit forbidden-call checks; app JS/CSS and player/resolver unchanged. Add public-safe documentation checkpoint.
- **Tests:** Independent `Function` compilation of the corrected test body **PASS**; prior script syntax **FAILED**. GitHub automated Node/Playwright/live-source/Preview tests on the new exact head remain PENDING, not automatically successful.
- **Evidence:** Draft [PR #124](https://github.com/lxhlw/Only-testing-online-music/pull/124); source parent `ff999ef7ffbabdf4ab2dd65a404b3883625aa28b`.
- **Not done:** Full exact-head CI, preview screenshots, source-capture reliability test, official deployment and physical device benchmarks.
- **Status:** Static syntax error addressed, pending CI. Production main v0.4.35 unchanged.
- **Next action:** Verify new GitHub Actions outcomes, repair further proven failures if any, then Stage 5.3 acceptance.


## 2026-11-05 · Stage 5.2 safe spectrum and cover breathing implementation

- **Goal:** Add music-reactive visual feedback to the working FyMusic Web player without risking audio silence caused by Web Audio re-routing of third-party media.
- **Changes:** Added UI2-only canvas/frequency logic inside existing `src/ui2-preview.js` (no extra static script), appended theme-aware scoped player/canvas/cover CSS. Uses safe capture-only `MediaStream` analysis when tracks and CORS allow it, with no output connection and no modifications to the original audio. Unsupported/no-data environments get static/clearly labeled bars; cover breathes softly only while playing. Canvas only 1101px+; energy sampling and animations stop on page hidden/reduced motion and source changes.
- **Tests:** Extended source/style contract and existing Chromium/WebKit 1440/820/390/320 browser regressions plus synthetic local WAV playback assertions. Exact new SHA Actions CI, isolation Preview, visual screenshot review and real-source cross-provider capture proof are **PENDING**. Previous branch Stage 5.1 CI was queued at initial check and must not be misrepresented as passed. No real-time FFT guarantee on opaque third-party streams.
- **Evidence:** [Draft PR #124](https://github.com/lxhlw/Only-testing-online-music/pull/124); [prior Stage 4.2B green Preview](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41874004682) only as historical evidence; exact new commit/CI to check after write.
- **Not done:** Stage 5.3 screenshot-based geometry and performance acceptance, provider-specific FFT live-data characterization, physical mobile/screen-reader/CPU tests, production merge/deployment or rollback exercise. Intermittent external provider failures remain open.
- **Status:** STAGE 5.2 CODE/TARGETED REGRESSION PREPARED; NEW CI PENDING; PR draft and main v0.4.35 unchanged.
- **Next action:** Check exact-head Playwright and strict real KG/MG actions, inspect screenshot artifacts, correct any mismatch, then explicit owner approval before controlled production publishing.


## 2026-11-05 · Stage 5.1 native SVG scenic atmosphere & gentle breathing candidate

- **Goal:** Enrich blank top-right and sidebar corners, chart hero and empty-library UI with restrained music atmosphere without hurting performance, accessibility, playback or mobile reachability.
- **Changes:** Scoped SVG data-URI landscapes/forest/vinyl artwork appended to `src/ui2-preview.css`; quiet opacity/transform header and mist breathing only on >=1101px desktop, static ranking panorama on >=741px and empty-library artwork with narrow-screen layout; distinct light/dark and reduced-motion/forced-colors paths. Strengthened existing style and 1440 Chromium/WebKit cross-view browser tests. No new fetched assets, player logic, HTML DOM, music resolver, lyric provider or audio elements; no published version bump.
- **Tests:** Code and public-safe handoff prepared for new SHA. Static source invariants checked in creation operation. GitHub exact-head privacy/style/browser/isolated Preview strict real KG→KW and native MG media+55 timed lyrics are **PENDING** and cannot be marked passed. Previous v0.4.36 #41874004682 success is old code only; earlier last branch head `0d4e0b20` privacy green, other CI were still unsettled at initial inspection.
- **Evidence:** [Draft PR #124](https://github.com/lxhlw/Only-testing-online-music/pull/124); [prior exact-code green Preview](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41874004682) (historical only). This operation's GitHub commit/CI will be verified after write.
- **Not done:** Real Web Audio spectrum and immersive cover pulse; new screenshot review; actual phone accessibility/performance tests; production merge/release or rollback rehearsal. Upstream provider intermittent failures remain unresolved.
- **Status:** STAGE 5.1 CANDIDATE SOURCE IMPLEMENTED; CI PENDING; official main v0.4.35 untouched.
- **Next action:** Verify strict Preview/PR CI, examine screenshot artifacts, then implement Stage 5.2 real audio analyzer with safe fallback; obtain explicit production authorization only after final acceptance.


## 2026-11-05 · Stage 4.2B release-preflight review, explicit owner gate retained

- **Goal:** Reconcile latest public handoff, official main/production and candidate v0.4.36 PR checks without accidentally merging a draft preview.
- **Changes:** Reviewed main and PR-branch CURRENT/LOG/POLICY, PR #124 code-diff and commit history. Confirmed Stage 4.2B `5d2ce2d4`→`a81fe772` is documentation-only. Reviewed search focus, player-lyric relocation, accessible SVG volume icon and scoped v0.4.36 styling for release scope. Recorded this sanitized preflight only in PR development-branch CURRENT/LOG; no application files, providers, credentials, external music URL or production runtime modified.
- **Tests:** Main exact `a8aafde8` Actions #41830551679 and privacy #41830551646 success. Code strict Preview #41874004682 success (unmocked KG→KW + original MG timed lyrics/cover/audio). Branch SHA `a81fe772`: UI isolated Preview #41875481813, playlist #41875494914, privacy #41875481994/#41875494741 success; full modern #41875494723 **IN PROGRESS (not yet passed)** at checkpoint preparation. Its status and any post-checkpoint Actions must be rechecked rather than assumed green. Direct live website fetch unavailable in this session.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/124 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41874004682 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41875481813 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41875494723 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41830551679 .
- **Not done:** Owner acceptance and explicit production permission; main merge, v0.4.36 official publish/verified real-site QA, physical mobile/screen-reader/hardware measurements and rollback rehearsal. Past provider intermittence remains a known risk.
- **Status:** Candidate v0.4.36 held on draft PR; official v0.4.35 remains released. Documentation-only checkpoint does not supersede exact code test evidence.
- **Next action:** Verify latest branch CI, obtain explicit visual/release approval, then perform nonforce reviewed merge and strict production acceptance with safe revert path; otherwise retain Preview only.
## 2026-11-05 · Stage 4.2B full strict QA finished and actual 44 browser PNGs reviewed

- **Goal:** Fix user-reported focused Search input collision, clipped mute focus circle, truncated right-side lyrics and bland real-web styling, and eliminate test blind spots exposed by direct screenshot inspection.
- **Changes:** Actual `index.html` restructures desktop dock lyrics as clickable center 2-line preview above timeline, preserving original playback/cover overlay. UI2 scoped CSS unifies Search focus, isolates right-only speaker volume with no clipped outline, strengthens light/dark contrast and professional depth. Original Stage 4.2 source `81ddf8b7` passed whole strict Preview #41872524101 but screenshot inspection found inherited lyric `max-width:190px` and low-contrast light mute icon. Follow-up `5d2ce2d483b9a701a27cb6541a0a8bfe6e635ee1` releases desktop lyric width and improves icon colors; test now demands >=330px lyric and acceptable computed color while muted, plus previous focus/mute/single audio tests.
- **Tests:** Exact corrected code [strict Preview #41874004682](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41874004682) COMPLETED **SUCCESS**, 16 homepage + 12 cross-view + 8 immersive + 8 interactive Chromium/WebKit dark/light PNGs, classic/320/security/404, exact original KG `稻香`→KW playable and original native MG `开始懂了` HTTP 200 real audio/cover/55 timed LRC/pause/resume. Independent browser/security #41874018232 SUCCESS, Playlist #41874018049 SUCCESS, privacy #41874018742/#41874004884 SUCCESS.
- **Human visual:** Downloaded [44 screenshot artifact #13346990599](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41874004682/artifacts/13346990599). Reviewed full Chromium light muted-player with expanded inline lyric, WebKit dark focus/volume and 320 light Search; new contrast and hierarchy are coherent without clipping. Screenshots use synthetic/blocked provider fixtures and cannot prove real catalog covers/album art; live original MG cover was separately verified in provider gate.
- **Evidence:** Real nonproduction site https://8a27e03f.only-testing-online-music.pages.dev/ ; [PR #124](https://github.com/lxhlw/Only-testing-online-music/pull/124) ; [original code commit `81ddf8b7`](https://github.com/lxhlw/Only-testing-online-music/commit/81ddf8b79b11f0646891ccc4284370e1da5235ad) and [corrected code `5d2ce2d4`](https://github.com/lxhlw/Only-testing-online-music/commit/5d2ce2d483b9a701a27cb6541a0a8bfe6e635ee1).
- **Not done:** Physical mobile/FPS/battery or real screen reader, live populated album art gallery inspection, long-term uptime of third-party provider, production merge/deploy and owner's aesthetic/release approval. Historic original MG 502 and KG timed lyrics failures remain recorded; one success does not guarantee uptime. This docs-only handoff checkpoint may trigger new CI independently.
- **Status:** Stage 4.2B design and exact-code strict CI green, PR still draft and live main v0.4.35 untouched.
- **Next:** Exactly one final milestone: after explicit owner approval and fresh branch/main/check checks, controlled PR merge + official Cloudflare v0.4.36 live full audio/lyrics/UI/security QA + rollback if needed.

## 2026-11-05 · Stage 4.2B screenshot-found max-width regression and muted speaker contrast

- **Goal:** Avoid falsely calling the real website visually finished merely because geometry tests are green.
- **Changes:** Inspected 44 real browser PNGs from exact `81ddf8b7` strict [Preview #41872524101](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41872524101). Search focus/button separation and unclipped mute ring fixed; **found inherited `max-width:190px` still limits center lyric preview and light-mode mute speaker icon is too pale**. CSS Stage 4.2B releases center lyric to full available grid width at >=1280px and increases light/dark mute control color contrast; no player/source/lyric data-flow changes. New Playwright asserts desktop lyric width >=330px and muted SVG contrast by computed color (both themes); static style contract updated.
- **Tests:** Stage 4.2 `81ddf8b7` strict Preview #41872524101 SUCCESS, independent browser #41872534147 SUCCESS, Playlist #41872533921 SUCCESS, privacy #41872533868/#41872524118 SUCCESS. New Stage 4.2B exact-head strict Preview/browser/privacy **PENDING** and must confirm 16+12+8+8 screenshot cases, real KG→KW and native MG unmocked music/cover/timed lyrics.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41872524101/artifacts/13345756251 ; https://github.com/lxhlw/Only-testing-online-music/pull/124 . No private screenshots attached to public repo.
- **Not done:** New exact corrected preview visual check, visual owner approval, actual mobile hardware/frame-rate/energy/screen reader, release to live main v0.4.36.
- **Status:** Code/test correction staged on draft PR; production still v0.4.35.
- **Next:** Verify new screenshots + strict source tests and close owner review; explicit-authorized final release later.

## 2026-11-05 · Stage 4.2 real music UI: search focus, accessible speaker controls, lyric positioning and visual polish

- **Goal:** Implement screenshot-reported visual faults and improve actual FyMusic website UX, not generate a design mockup.
- **Changes:** Search focus now has one unified outer ring; native input focus outline removed without losing outer keyboard indicator, and Search button has a safe gap. Moved `#player-lyric` button to wide center transport grid on desktop, two-line preview with click opening existing album/lyrics overlay. Kept real mute button/volume control at far right with no clipped overflow, focus-safe padding and real speaker pictogram. Upgraded light/dark background depth, typography, card surface and playback dock with low-cost gradients. Added responsive hide of extra lyric at narrower widths and reduced-motion/forced-colors guards. Preserved single native audio, actual music provider API, replay/seek/queue/lyrics sync and classic fallback.
- **Tests:** New Chromium/WebKit 1440 dark/light focus-input/search-gap, visible lyric column, volume focus ring, actual audio mute/unmute and SVG assertions + **8 synthetic interaction screenshots** added to original 16 homepage, 12 cross-view, 8 immersive. **New code SHA CI PENDING**. Before changes, docs-only `3f833cb7` Preview #41868997491 failed original KG fallback timed LRC requirement; original MG passed. Independent PR browser/security/playlist/privacy checks all passed at that docs HEAD. Earlier `45f96d93` full real KG/MG gate passed once, not source uptime guarantee.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/124 ; Stage 4.2 code commit & new exact runs to be verified. Architecture draws on mainstream music product hierarchy, not copied branding/assets. User screenshot files are not stored publicly.
- **Not done:** New exact-CI result, visual screenshot inspection, real populated live album cover catalog audit, physical-device performance/screen-reader, production deploy, user design approval.
- **Status:** Design candidate on draft PR, official main still v0.4.35.
- **Next:** Validate exact-head UI and all strict real music/lyrics tests, fix detected issues, obtain owner visual signoff, then explicitly authorized final production release.

## 2026-11-05 · Stage 4.1 strict real-preview browser and music acceptance complete; exactly 1 step remaining

- **Goal:** Close screenshot-proven UI contrast failures in the real editable website before asking for the final production release.
- **Changes:** Stage 4.1 CSS and Playwright checks at `45f96d93c11636c5683a8e96d11b7ceafba56fed`: correct dark Playlist source/category filters previously white, light Ranking empty pseudo-element previously dark, all theme states and forced colors. Browser assertions now verify computed filter colors and `::after` pseudo-element in Chromium/WebKit. No audio/source/lyrics/queue/runtime change.
- **Tests:** Exact-code [isolated Preview #41866987311](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41866987311) **SUCCESS**, includes 16 home + 12 cross-view dark/light Chromium/WebKit page screens, 8 immersive local fixtures, protected/static Pages, strict original real KG《稻香》→KW fallback, original native MG 孙燕姿《开始懂了》 real HTTP 200 music/cover + 55 timed lyrics + pause/resume. Independent [modern PR browser/security #41867001740](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41867001740) **SUCCESS**, [Playlist PR #41867001753](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41867001753) **SUCCESS**, privacy #41866987093 success and #41867001892 **job completed/success** (workflow run status still propagating at that read). First Stage 4 Preview #41861872946 had MG 502 LRC upstream timeout, retained as historical intermittent failure rather than erased.
- **Evidence:** Downloaded and examined [36 real-browser synthetic screenshots](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41866987311/artifacts/13343420887). Confirmed Chromium/WebKit dark Playlist filters dark, light Ranking empty placeholder light, other tested page surfaces legible and 320 light Search not clipped. New immutable **nonproduction** Preview https://adb161a5.only-testing-online-music.pages.dev/ . Visual screenshot fixtures do NOT exercise live populated playlist art; immersive fixture cover is a placeholder, while the separate strict original MG test verified live artwork.
- **Not done:** User/owner visual approval of the final actual candidate, nonforce merge, official deployment, actual production music/playback/lyrics/site regression, real device/energy/FPS/accessibility screen-reader testing, long-run source availability.
- **Status:** Stage 4.1 code acceptance green at exact code SHA; PR #124 remains DRAFT, official live main v0.4.35. This public docs-only checkpoint will introduce a different SHA and new CI; never equate its pending result with the tested source SHA.
- **Next:** **Exactly one remaining production-release stage**, conditional on explicit approval: check PR/main/checks, merge safely, inspect actual Cloudflare official site, real original KG/MG audio+cover+lyrics, mobile/theme/404/seek/queue/classic, document rollback and final handoff.

## 2026-11-05 · Stage 4.1 confirmed visual defects in real screenshots, fixed targeted CSS and tests

- **Goal:** Close search/playlist/chart/library screenshot defects rather than relying on superficially green home-only automated checks.
- **Changes:** Downloaded 36 PNGs from [exact initial Stage 4 Preview #41861872946](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41861872946/artifacts/13339837999) and inspected light/dark 1440 Playlist/Ranking/Library. Observed **white playlist filter child bars in dark mode** and **dark chart empty pseudo-element in light mode**. Fixed `src/ui2-preview.css` via targeted UI2 dark/light `#view-playlist>.playlist-filter-stack>...` and `#ranking-songs:empty::after`/real child `.empty-note`, including mobile and forced-colors. Strengthened Chromium/WebKit dark/light browser tests to assert computed filter surface colors and the actual chart empty pseudo-element, and static style contract.
- **Tests:** Initial exact `586916e0` strict Preview #41861872946 **FAILED original native MG lyrics**: API HTTP 502 upstream timeout and 0 timed lines, not a CSS-specific failure. Same run confirmed 16 home + 12 cross-view visual browser gates and 8 immersive fixture captures, actual original KG→KW playable recovery, 404/asset checks passed. Independent PR browser/security #41861884246 SUCCESS, playlist #41861884241 SUCCESS, privacy #41861872866/#41861884322 SUCCESS. **New Stage 4.1 exact-head tests PENDING** at commit time, not yet screenshot-reviewed.
- **Evidence:** [Draft PR #124](https://github.com/lxhlw/Only-testing-online-music/pull/124); [Stage 4 visual artifact](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41861872946/artifacts/13339837999). No user-provided screenshots or private details committed.
- **Not done:** Confirm corrected screenshot appearance on new exact SHA, strict original MG real LRC pass, user visual signoff, physical device performance/screen-reader audit, official merge/deployment.
- **Status:** Stage 4.1 candidate CSS/test changes, main v0.4.35 untouched and PR draft.
- **Next:** Get new CI and actual browser screenshot evidence, fix if necessary, then request authorized production release only after visual approval.

## 2026-11-04 · Stage 4 actual FyMusic website redesign (not an image-only mockup)

- **Goal:** Respond to defects shown on the live v0.4.35 interface with editable website source code rather than a decorative mockup. Avoid premature v0.4.36 release.
- **Changes:** Implemented a scoped Stage 4 CSS design system for Search, Playlist Gallery, Ranking, Library and desktop Player. Corrected search button alignment, removed redundant context label, gave cards two-line titles, used full original playlist covers without forced CSS cropping, matched dark/light chart and empty-list surfaces to their themes, aligned volume/lyric region and styled speaker icon. `src/player-controls.js` now renders a static SVG speaker/mute pictogram in the existing button, keeping audio volume/mute actions unchanged. Navigation anchor resets scroll on actual top-level page switch, addressing clipped chart headings. Extended 1440 dark/light Chromium/WebKit screenshot/geometry checks across Playlist/Ranking/MyList in addition to existing home and immersive tests; syntax gate expanded.
- **Tests:** Prior v0.4.36 code `c5985ef3` isolated strict Preview #41855336495 was GREEN, but did not cover this Stage 4 implementation. **New Stage 4 exact SHA tests are PENDING** and must include strict unmocked provider playback (KG《稻香》→KW, native MG《开始懂了》+55 timed LRC+art/pause/resume), PR/browser, privacy, new screenshot contact review. No source logic changed.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/124 . Actual screenshot feedback was analyzed but not committed publicly.
- **Not done:** New exact-head CI, Stage 4 real browser screenshot review, real physical device FPS/screen reader, user visual approval, production merge/deploy.
- **Status:** Stage 4 implementation on isolated draft PR; official `main` v0.4.35 unchanged.
- **Next:** Verify checks on exact new branch HEAD; review real app screenshot output and repair observed issues; only then invite owner to inspect real Preview. Final production release remains explicitly gated.

## 2026-11-04 · Step 2 v0.4.36 Stage 3 RC strictly verified; one production step remains

- **Goal:** Finish version/cache release preparation without altering the official v0.4.35 website.
- **Changes:** RC code `ab4feb60` bumped package/version/app/HTML/settings labels and CSS/JS cache queries to v0.4.36; build caught stale hardcoded v0.4.35 UI2 test assertions before Preview (#41854783706), repaired in `c5985ef328b8d16e828f3a20dbf3d5cf51788ebc` by deriving test versions from `version.json`. No playback/source/lyrics/proxy/runtime code changes or bypasses.
- **Tests:** Exact corrected v0.4.36 code HEAD [isolated Preview #41855336495](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41855336495) SUCCESS: 16 Chromium/WebKit dark/light homepage + 8 immersive screenshots, accessibility/320/dock/404/classic gates, strict real KG `稻香`→KW playable fallback and original MG 孙燕姿《开始懂了》 real playback+cover+55 timed LRC+pause/resume. [PR security/browser #41855343685](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41855343685) SUCCESS, [playlist #41855343551](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41855343551) SUCCESS, privacy #41855343553/#41855335973 SUCCESS.
- **Visual evidence:** Downloaded [24 PNG screenshot artifact #13337537326](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41855336495/artifacts/13337537326), inspected 1440 dark/light, 320 light and desktop/mobile immersive; layout clear and v0.4.36 shown. Immersive synthetic image is an intentionally blank 1×1 test cover; strict real MG separately verified loaded cover. New NONPRODUCTION Preview https://a43bc825.only-testing-online-music.pages.dev/ .
- **Not done:** User's explicit final release approval, production merge/deployment, official live regression, physical device/screen reader/FPS, guaranteed upstream MG reliability. Docs-only checkpoint triggers new CI which must not be presumed green.
- **Status:** Step 2 complete, candidate tested green, draft PR #124 unmerged; production main v0.4.35 unchanged.
- **Next:** Exactly 1 step—after explicit release approval, nonforce merge, official Cloudflare v0.4.36 verification, real music/lyrics tests and public-safe final handoff or revert as necessary.

## 2026-11-04 · v0.4.36 isolated Preview build exposed hardcoded v0.4.35 UI2 test pins

- **Goal:** Fix a release-version test mismatch without weakening a strict acceptance gate or changing runtime.
- **Changes:** First candidate `ab4feb60` Preview #41854783706 FAILED build after version metadata test PASSED: old `test-ui2-contract.mjs` expected `?v=0.4.35`. Discovered another old pin in `test-ui2-phase2-style.mjs` plus old CSS Atmosphere candidate marker. Change checks to use authoritative `version.json` and update marker to v0.4.36 in CSS/style contract. The static asserts still enforce matching CSS/JS URLs; no source audio/lyrics/queue/network or product behavior modifications.
- **Tests:** Exact follow-up corrected commit new strict Preview, PR security and privacy **PENDING** at checkpoint; initial build failure is not a native Migu failure. Prior v0.4.35 Stage 3 strict preview #41852903774 SUCCESS.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41854783706 ; https://github.com/lxhlw/Only-testing-online-music/pull/124.
- **Not done:** Fresh corrected-SHA tests, isolated v0.4.36 Preview, production merge/deploy, owner signoff, hardware screen-reader/performance.
- **Status:** v0.4.36 RC held on draft branch, v0.4.35 production unchanged.
- **Next:** Verify exact-SHA corrected workflow before declaring release-preparation complete; one production release step only when green and approved.

## 2026-11-04 · v0.4.36 controlled release candidate version/cache preparation

- **Goal:** Prepare second-round UI2 Atmosphere Stage 3 for a safe future versioned production release, without deploying.
- **Changes:** Bump candidate package/version/app/HTML/settings versions from 0.4.35 to 0.4.36; update all HTML query-string CSS and JS cache IDs. Add release/version consistency checks in `scripts/test-version.mjs`; replace stale pinned preview-workflow version assertions with current `version.json` checks; create [v0.4.36 RC checklist](FYMUSIC_STAGE3_V0436_RC_20261104.md), including explicit rollback and no-force deployment controls. Playback/providers/lyrics/routing/DOM unchanged.
- **Tests:** Previous pre-bump `14241a9a` isolated strict Preview #41852903774, independent browser #41852918815 and privacy #41852918755/#41852903849 all SUCCESS, with earlier 16 homepage + 8 immersive UI and real KG→KW/MG tests. **New exact v0.4.36 HEAD tests are PENDING**; no inference from old SHA.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/124 ; [RC plan](FYMUSIC_STAGE3_V0436_RC_20261104.md).
- **Not done:** v0.4.36 exact-head Preview/browser/security/native music results, physical device/screen-reader/perf, owner approval, main merge, official Cloudflare deployment.
- **Status:** Candidate-only, v0.4.35 production and draft PR preserved.
- **Next:** Observe exact v0.4.36 CI results; if green and approved, only one remaining production release/verification step.

## 2026-11-04 · Stage 3 fully tested and visually reviewed; 2 release steps remaining

- **Goal:** Complete the next design-acceptance milestone with synthetic screenshot coverage for immersive playback and unchanged mandatory real-music gates.
- **Changes:** Test-only code `3feb287679e985757f8a3605470b8ed692259c7a` added immersive screenshots to the existing Chromium/WebKit now-playing browser regression: desktop and mobile × dark and light, one original audio element, visible album/lyric regions, no horizontal overflow, preserved theme toggling while modal open, play/pause/resume/close. Audio/album data in this screenshot run are local test fixtures; product runtime untouched. Downloaded and reviewed 24 generated CI PNGs (16 homepage + 8 immersive); desktop dark and 320 light plus full contact sheets inspected.
- **Tests:** Exact-code [isolated strict Preview #41851542229](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41851542229) **SUCCESS** (local/deployed 16/16 Chromium/WebKit dark/light screen matrix, accessibility/theme/320/820/1440/404, KG `稻香`→KW real playable recovery, native MG `开始懂了` original real audio + cover + HTTP 200 with 55 timed LRC + pause/resume). Independent [PR browser/security #41851554252](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41851554252) SUCCESS; [privacy #41851542159](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41851542159) and [#41851554053](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41851554053) SUCCESS. Synthetic screenshot artifact [#13335596912](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41851542229/artifacts/13335596912), latest immutable visual Preview https://147e84c8.only-testing-online-music.pages.dev/ .
- **Evidence/limitations:** UI screenshots visually sound at tested sizes. The local test cover is intentionally a **1×1 placeholder** (can appear as blank white/gray square), not an actual artwork test; strict original real MG coverLoaded is a separate successful test. Past upstream native MG flakiness persists in recorded attempts; no full hardware FPS/CPU/memory/touch or real screen reader was assessed. Production untouched, draft PR.
- **Status:** Stage 3 visual implementation, synthetic screenshot QA and entire tested candidate pipeline green on `3feb2876`; release unapproved, not deployed. This docs-only checkpoint itself will create new CI, which must be checked separately.
- **Not done:** Design owner's release signoff, v0.4.36/cache-bust release prep, official merge/deploy acceptance, actual device performance and screen-reader evidence.
- **Next:** **2 steps remaining:** (1) controlled release candidate version/cache preparation + exact strict Preview/PR checks and review; (2) explicit-authorized nonforce production merge, Cloudflare deployment verification and public-safe final handoff.

## 2026-11-04 · Stage 3 visual QA: review real CI screenshots, extend immersive dark/light captures

- **Goal:** Continue Stage 3 acceptance without conflating homepage screenshot quality and full now-playing experience; retain strict live original audio safety gate.
- **Changes:** Downloaded public CI [artifact 13336510061](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41847480447/artifacts/13336510061), visually inspected 16 synthetic homepage screenshots for Chromium/WebKit desktop 1440, tablet 820 and phones 390/320 in dark/light; no obvious first-screen hero-dock collision, clipping or horizontal overflow in examined samples. Expanded existing `scripts/test-ui2-desktop-browser.mjs` only: preserve real single synthetic WAV/audio fixture with actual album image/2 timed LRC lines and player controls, assert immersive album/lyric presence and no overflow, screenshot the immersive overlay in BOTH themes at desktop/mobile Chromium/WebKit (8 samples), ensure switching theme doesn't close the modal and original pause/resume/close checks remain. No runtime or CSS modifications.
- **Tests:** Original Stage 3 code `6cf8dfc0` [Preview #41847480447](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41847480447) overall FAILED on native original Migu real audio stall within 35s, exact song found; **local/deployed 16-case visual/browser suite, original KG→KW strict real playback and Pages security PASSED**. Separate [PR browser/security #41847489368](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41847489368) SUCCESS, privacy #41847480458/#41847489169 SUCCESS. **New immersive screen exact-head CI PENDING**; no fake green release claim.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/124 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41847480447 .
- **Not done:** New immersive screenshot inspection, physical modern-device metrics, real screen-reader, long-term original Migu reliability, design owner approval, release version bump or main deployment.
- **Status:** Design candidate / additional test-only coverage. Production main v0.4.35 unchanged and PR draft.
- **Next:** Observe precise new workflow + screenshot artifacts, correct actual failures if needed, then proceed to release preparation only once design accepted and strict native Migu passes.

## 2026-11-04 · Atmosphere Stage 3 second-round aesthetic enhancement, nonproduction candidate

- **Goal:** Build a stronger professional music-product aesthetic than Stage 2 while preserving player reliability, responsive geometry and accessible light/dark themes.
- **Changes:** CSS-only `STAGE 3 — SPATIAL MUSIC POLISH` layer for richer static hero ambiance, elevated dock/cover/play CTA, consistent music suggestion chips, collection/search rows and immersive lyrics active focus; separate porcelain/jade light-mode treatment with **opaque** player base. Fine-pointer hover only; reduced-motion/pointer-coarse/forced-colors respected. Enhanced style gate for new scope/tokens, 16-case browser gate for shadow and desktop heading hierarchy. No DOM/audio/source/lyric/data JS or external assets. Recorded scope/safeguards in design report.
- **Tests:** Prior Stage 2 `76c2b541` isolated Preview [#41843790180](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41843790180) SUCCESS, and docs-only branch-head [PR browser #41845091745](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41845091745) SUCCESS; latest docs-only Preview #41845083255 was in progress when this stage started. **Stage 3 exact-HEAD tests NOT YET VERIFIED** at checkpoint creation; leave pending. Physical FPS/CPU/memory/screen-reader tests still not run.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/124 and [design report](FYMUSIC_UI2_ATMOSPHERE_DESIGN_20261104.md).
- **Not done:** New immutable Preview, screenshots/new changes inspected, strict real MG pass, PR merge, production deploy, true hardware tests.
- **Status:** Draft PR #124 only, official main v0.4.35 unchanged.
- **Next action:** Inspect exact Stage 3 CI/browser screenshot artifacts, correct only observed issues, then seek explicit design/release approval.

## 2026-11-04 · Atmosphere Stage 2 screenshot-driven desktop overlap fix verified, production not changed

- **Goal:** Inspect real synthetic dark/light screenshots and eliminate desktop first-screen welcome-card collision with the fixed mini-player while preserving all music features.
- **Changes:** Audited prior [screenshot artifact 13329412765](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41842016635/artifacts/13329412765), confirmed 1440 desktop welcome card too narrow and partly hidden by 93px dock, despite previous 320 checks. Commit `76c2b5413104ae30e044c518c6d397561fa208c9`: CSS-only responsive desktop/tablet welcome card (min width 741px, up to 950px wide; ~246px height, editorial left alignment) and **16** Chromium/WebKit design tests instead of 12, adding 820px tablet and mandatory desktop/tablet `heroBottom <= dockTop - 12px` plus hero width thresholds; original 320 layout and entire audio/lyric/seek runtime unchanged. Reinspected [new screenshot artifact 13329279643](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41843790180/artifacts/13329279643): 1440 dark/light CTA and footer fully visible, clear gap to dock; 820/320 screenshots visually unobstructed.
- **Tests:** Exact design-code HEAD [Preview #41843790180](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41843790180) **SUCCESS attempt 1**, local+deployed 16/16 UI, all legacy/keyboard/contrast/reduced-motion/asset/404 guards, unmocked real KG `稻香`→KW and exact original MG `开始懂了` real audio+cover+timed lyrics+pause/resume PASS. Independent PR [browser/security #41843800517](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41843800517) SUCCESS, public-safe privacy #41843790568/#41843800470 SUCCESS. Earlier native MG failures (HTTP 502/35s audio stall) remain historical evidence; no guaranteed uptime.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/124 ; https://github.com/lxhlw/Only-testing-online-music/commit/76c2b5413104ae30e044c518c6d397561fa208c9 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41843790180 .
- **Not done:** Human approval from production owner, production merge/version-bump/deploy, physical 320px finger touch, actual screen reader, hardware FPS/CPU/memory/battery, rollback rehearsal. Docs-only new checkpoint will trigger new Actions; do not prematurely call them green.
- **Status:** UI visual regression FIXED and verified; candidate PR DRAFT; main still v0.4.35.
- **Next action:** Collect design approval / targeted feedback, then prepare controlled versioned release candidate with unchanged strict native media gates and real production verification.

## 2026-11-04 · Atmosphere design screenshot audit: desktop welcome card covered by player; Stage 2 fix

- **Goal:** Continue PR #124 professional visual review rather than assume twelve assertions equal human design quality.
- **Changes:** Downloaded and examined synthetic CI screenshots from public [artifact #13329412765](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41842016635/artifacts/13329412765). Chromium/WebKit 1440×900 dark/light desktop welcome card was a narrow ~437px vertical panel whose lower action/footnote area lay behind the fixed 93px player; 320px preview was visually unobstructed. Added CSS-only desktop/tablet first-screen layout with width min(100%,950px), compact welcome hierarchy and left alignment; no functional player or mobile geometry changes. Augmented synthetic browser test from 12 to **16 cases** (adds 820px dark/light in Chromium/WebKit) and introduced strict hero-width and `heroBottom <= dockTop - 12px` assertions for desktop/tablet.
- **Tests:** Prior docs-head [PR CI #41842025611](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41842025611) and privacy #41842025581 SUCCESS, while strict [Preview #41842016635](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41842016635) FAILED original Migu real playback. New exact Stage 2 branch HEAD CI **PENDING / NOT CLAIMED PASS**.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/124 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41842016635/artifacts/13329412765 .
- **Not done:** New screenshot/geometry review, strict MG green, physical phone/screen-reader/FPS/CPU or production merge/deploy.
- **Status:** Candidate design fix, official v0.4.35 unchanged and PR #124 DRAFT.
- **Next action:** Verify exact-head 16-case assertions and screenshot visibility, then revisit strict live music gate separately; maintain release hold.

## 2026-11-04 · Atmosphere visual RC reached full UI/browser pass; native Migu live gate blocked two attempts

- **Goal:** Test refined UI2 look across dark/light and 320px without losing music reliability or hiding actual upstream errors; checkpoint accurate evidence for future sessions.
- **Changes:** Visual-only PR #124 design head `7df4d72c`: CSS static editorial disc/lighting/playlist/dock plus light search/player contrast fixes; independent static and Chromium/WebKit visual tests, strict nonproduction Preview live music workflow, public-safe screenshot design report. No audio/lyrics/source/player runtime code modifications. This entry and CURRENT updated **after** CI attempts to preserve detailed status. Public production unchanged.
- **Tests:** Independent PR browser/audio/security [#41840359135](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41840359135) SUCCESS; privacy #41840359147 and #41840351880 SUCCESS. Strict Preview [#41840351705](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41840351705) attempt 1 overall FAILURE: native MG LRC HTTP 502 upstream_timeout; attempt 2 FAILURE: original MG exact song matched and LRC step reached, but actual media did not progress by 35s (`readyState=0`). BOTH attempts: local/deployed UI2 + new Atmosphere 12/12 browser/theme/320px a11y/layout tests and strict KG `稻香`→KW real playable recovery SUCCESS. Latest immutable Preview https://945132e1.only-testing-online-music.pages.dev/ . Screenshot artifact 13328403131 is synthetic CI, not user/device signoff.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/124 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41840351705 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41840359135 .
- **Not done:** Actual human visual/hardware inspection, physical screen reader/FPS/CPU/memory, verified exact-head strict Migu acceptance, PR merge, version bump/cache rollout or official site deployment. Music upstream intermittence persists; cause not proven.
- **Status:** VISUAL/BROWSER GREEN on tested code; strict native MG RED twice; RELEASE HOLD / official v0.4.35 unchanged.
- **Next action:** Inspect design Preview and screenshot artifact, get visual acceptance; investigate the strict live MG availability independently without weakening test; only when all exact-head checks green and explicit release approval consider production.

## 2026-11-04 · UI2 Atmosphere light player background regression fixed in candidate

- **Goal:** Preserve existing strict light-theme contrast tests after layered gradients.
- **Changes:** Candidate PR #124 `3100195c` [browser #41839795150](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41839795150) and [Preview #41839786465](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41839786465) failed `chromium/desktop player should be light: rgba(0,0,0,0)`. Added opaque computed player background-color while preserving gradient image, including mobile light variant; added browser luminance assertion for search and player. All application playback and lyric logic remains unchanged.
- **Tests:** New 12-case Atmosphere browser check passed before this change, but the separate existing light theme check was FAILED; new exact HEAD checks PENDING. No production UI2 design release.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/124 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41839795150 .
- **Not done:** Fresh exact-head full browser and strict real-provider acceptance, screenshot review, device tests or production release.
- **Status:** Nonproduction candidate correction awaiting CI.
- **Next action:** Check exact HEAD CI and inspect real code failure evidence; do not bypass light/a11y assertions.

## 2026-11-04 · Atmosphere design CI light-search computed base regression corrected

- **Goal:** Keep strict light-theme accessibility checks while layering a gradient onto the homepage search field.
- **Changes:** Initial exact `0131bc71` Preview #41839250683 failed existing light-theme desktop contrast computed-color gate because `background` shorthand made search background-color transparent. Updated CSS with explicit opaque white background-color and separate gradient background-image; augmented synthetic visual test to assert bright computed base. No media/lyrics/UI behavior code changed. Added accurate public-safe handoff and design report annotation.
- **Tests:** Initial CSS/style/privacy/default/Atmosphere browser 12 cases PASS; light-theme existing test FAIL; deployed Preview not run, strict MG step did not have a test URL (not a provider failure). New exact-head CI **PENDING**.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41839250683 ; synthetic screenshot artifact 13326833761 (not physical device evidence).
- **Not done:** Updated exact-head full CI, screenshot review, deployed strict live music, release/merge and physical device/screen reader tests.
- **Status:** Candidate nonproduction; main unchanged.
- **Next action:** Inspect new CI and ensure light background-color, visual matrix, real provider and privacy all pass.

## 2026-11-04 · UI2 Atmosphere editorial visual polish on isolated development branch

- **Goal:** Make the official UI2 aesthetic more distinctive and refined while keeping performance, music reliability and 320px reachability intact.
- **Changes:** Created nonproduction `design/fymusic-ui2-atmosphere-20261104` from verified main `a8aafde8`. Appended CSS-only Atmosphere theme (static CSS record/grooves, lighting, typographic rhythm, playlist cards, player dock, matched light/dark, reduced-motion/coarse-pointer/forced-colors); no JS/UI DOM or runtime media changes. Added static style contract, 12 synthetic Chromium/WebKit visual cases and new isolated Cloudflare Preview CI with mandatory strict original KG and MG song tests and sanitized screenshot artifact. Added design report and public-safe CURRENT/LOG checkpoint.
- **Tests:** Prior production [#41830551679](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41830551679) SUCCESS and privacy [#41830551646](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41830551646) SUCCESS on unchanged main. New design branch tests **PENDING / UNVERIFIED** until observed; no real audio or screenshot claims from this change. Test fixtures are only for synthetic visual runs, never live media acceptance.
- **Evidence:** `src/ui2-preview.css`, `scripts/test-ui2-atmosphere-style.mjs`, `scripts/test-ui2-atmosphere-browser.mjs`, `docs/FYMUSIC_UI2_ATMOSPHERE_DESIGN_20261104.md`.
- **Not done:** Candidate exact-head green CI, screenshot review and manual approval, production merge/deploy, real device performance/screen-reader validation.
- **Status:** Nonproduction design candidate. Official v0.4.35 remains deployed and unchanged.
- **Next action:** Verify exact branch HEAD tests, review screenshots and fix observed regressions before requesting any release authority.

## 2026-11-04T20:32:15+08:00 · v0.4.35 UI2 default merged, officially deployed, strict production acceptance GREEN

- **Goal:** Honor explicit approval to ship modern UI2 by default despite acknowledged *unmeasured* physical phone/real screen-reader/hardware performance risks, while keeping strict real music/lyrics/browser/security release gates mandatory.
- **Changes:** Candidate `07a1943e` was verified green in [RC #41826814105](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41826814105), privacy #41826814115. Merged approved GitHub [PR #123](https://github.com/lxhlw/Only-testing-online-music/pull/123) with exact-head guard via ordinary merge to `main` as `c879eb6f76cca6f8776ffe61ef9cb7457605541e`; no force push. Version v0.4.35 released with default UI2 and reversible URL classic `?ui2=0`; no production player/lyrics source rewrite. Cloudflare Pages official site verified version `0.4.35`, entrypoint/assets, branded static 404, actual-page browser UI and audio tests. Created this public-safe handoff/release-acceptance checkpoint **after** production workflow completed to avoid cancellation.
- **Tests:** [main Actions #41827353768](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41827353768) run attempt **1 CANCELLED** during Chromium install (no verified cause); attempt **2 FAIL** only mandatory Migu real media progression after deploy+browser/security+Kuwo passed; a single unchanged-code publish-job retry attempt **3 COMPLETED SUCCESS** on `c879eb6f` (completed 2026-11-04T12:32:15Z). Successful steps include official 0.4.35 meta/versioned assets, 404/exposure protection, Chromium/WebKit default UI2/legacy route, cover/lyric/one audio, Kuwo original media+timed LRC, MG exact original `开始懂了` with real progressing audio, official HTTP 200 55 timed lyrics, cover, pause/resume. KG→KW recovery test passed on candidate; production KG recovery informational completed. Merged privacy [#41827353708](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41827353708) SUCCESS. Provider availability remains intermittent; do not hide failed attempts.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/123 ; https://github.com/lxhlw/Only-testing-online-music/commit/c879eb6f76cca6f8776ffe61ef9cb7457605541e ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41827353768 ; https://only-testing-online-music.pages.dev/ .
- **Not done:** Actual phone 320px physical tap, real screen reader, device CPU/FPS/memory/battery, guaranteed long-term upstream SLAs, actual rollback rehearsal. Explicit acceptance of these unknown hardware/a11y risks is recorded, not a claimed test pass. This docs-only checkpoint may launch further main Actions; exact status must be rechecked.
- **Status:** **OFFICIAL v0.4.35 DEPLOYED AND STRICT REQUIRED MAIN ACCEPTANCE GREEN** on merge SHA; no rollback. Retain previous production v0.4.34 baseline `781c133e`, immediate UI escape `?ui2=0`.
- **Next action:** Confirm the post-checkpoint main-head privacy/action status without changing source; monitor provider reliability and practical UX. If verified code regression, non-destructively revert merge `c879eb6f`, never rewrite `main`.

## 2026-11-04 · UI2 default release acceptance: targeted Preview harness stabilization

- **Goal:** Advance explicitly authorized PR #123 without bypassing mandatory observed failures; isolate theme-only visual checks from intentionally blocked third-party network traffic.
- **Changes:** PR #123 release authority already recorded with physical/a11y measurement uncertainty accepted. Three unchanged-code strict Preview attempts [#41819811661](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41819811661) FAILED for documented reasons: transient initial root 500; real KG/KW and MG playback progress; and a blocked-network 320px theme test `AggregateError`, respectively. In attempt 3 original MG real audio, 55 timed lyrics/cover/pause-resume passed. Added local-only LX fixture to the theme/keyboard test, no exception suppression, matching pre-existing default visual harness. Added bounded immutable Preview homepage HTTP-200 readiness checking. Kept real KG `稻香`→KW and MG `开始懂了` unmocked mandatory.
- **Tests:** Last known exact old HEAD `f84a090d` mandatory integrated Preview FAILED attempts 1–3, not green. New HEAD CI is PENDING. The change does not modify application runtime, media resolver or lyric logic; no production promotion.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/123 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41819811661 .
- **Not done:** Exact candidate HEAD fully green, production merge/deploy, actual physical device/screen-reader measurements, rollback drill and guaranteed provider availability.
- **Status:** RELEASE HOLD on nonproduction test-harness candidate. Physical-device unknowns approved as risks, observed real-source errors not waived.
- **Next action:** Read new exact HEAD Actions. Merge only if green; after merge verify official version/site/audio/security then checkpoint actual results.

## 2026-11-04T19:14:36+08:00 · PR #123 v0.4.35 exact-head strict live acceptance recovered without code changes

- **Goal:** Resolve the latest exact-head strict real-source gate, preserve prior failure evidence, verify all candidate browser/playlist/privacy checks, and prepare release review without silently deploying.
- **Changes:** Confirmed PR #123 READY FOR REVIEW (OPEN, unmerged), main remains production v0.4.34; inspected exact code/documentation SHA `1efe5cdced0f599dce34e4c9a09df2aa7a6b86a9` and Actions steps/logs. Started precisely one same-code rerun of the failed isolated Preview workflow, performed no runtime or assertion change, and recorded public-safe failure/success distinction in PR body. Updated CURRENT and append-only LOG as one docs-only candidate-branch checkpoint; newly created HEAD checks must be reverified.
- **Tests:** At exact code SHA `1efe5cdc`, full browser/security [#41818175238](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41818175238), playlist [#41818175190](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41818175190) and privacy [#41818175165](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41818175165) all SUCCESS. Strict Preview [#41818168130](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41818168130) **attempt 1 FAILURE** at real alternate KG→KW audio and original MG real audio, while UI/static local+deployed checks passed. Same code run **attempt 2 SUCCESS**: all UI browser/opt-out/assets, strict real KG `稻香` recovery and strict MG `开始懂了` audio, cover, 55 timed lyrics and pause/resume passed; deployed isolated Preview https://ec2509b0.only-testing-online-music.pages.dev/ . Failures were never reclassified as passes. The new documentation HEAD is not claimed CI-green until observed.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/123 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41818168130 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41818175238 ; https://ec2509b0.only-testing-online-music.pages.dev/ .
- **Not done:** Production merge/deploy, device-based 320px touch, real screen reader, physical FPS/CPU/memory, provider SLA/root cause, actual rollback test. Official main earlier [#41791887065](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41791887065) still failed mandatory Migu playback in an independent earlier run.
- **Status:** Latest tested candidate exact code-head mandatory automation GREEN after one rerun, **production release still HOLD** awaiting remaining approvals and checks; v0.4.34 official unchanged.
- **Next action:** Verify new docs checkpoint Actions, request explicit production release authorization with unverified physical tests acknowledged, then controlled non-force merge and actual production v0.4.35 regression or halt if tests fail.

## 2026-11-04 · PR #123 v0.4.35 strict Preview green, preserved release hold

- **Goal:** Reconcile latest nonproduction UI2-default work against authoritative GitHub commits, actual Actions and handoff/privacy policy; advance review-readiness without prematurely publishing.
- **Changes:** Audited PR #123 at code SHA `bbc6ccf5`, its UI2 default/legacy `?ui2=0` feature and version/cache bump; verified isolated Preview URL. Updated CURRENT and appended LOG together as public-safe checkpoint on release branch; no player/media/lyrics runtime change, no production merge/deploy or rollback. Prepare PR for review, not automatic merge.
- **Tests:** RC [#41795393252](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41795393252) run attempt 2 **SUCCESS** on `bbc6ccf5`: local/deployed Chromium+WebKit, dark/light, 1440/320, simulation touch, classic opt-out/reload, single audio, route guard; real original KG `稻香`→KW playable fallback with 48 timed lines; real original MG `开始懂了` with 55 timed lines, cover, real playback and pause/resume. Full browser/security [#41795397792](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41795397792), playlist [#41795397783](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41795397783), privacy [#41795397744](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41795397744) **SUCCESS** at that exact code HEAD. Official main [#41791887065](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41791887065) **FAILURE** in strict Migu live acceptance after browser/security passed; previous successful main run [#41786525697](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41786525697) run attempt 2. New docs-only commit requires its own post-write privacy/exact-head check; do not pre-label it passed.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/123 ; https://fae3f8f8.only-testing-online-music.pages.dev/ ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41795393252 .
- **Not done:** Production merge/deploy, human/device 320px actual-touch, physical real-screen-reader, hardware FPS/CPU/memory/battery, tested rollback, guaranteed music-provider uptime.
- **Status:** All independently checked **candidate code-head** automated tests green; only v0.4.34 on production. PR review and controlled release remain pending.
- **Next action:** Verify fresh branch HEAD Actions after this handoff commit, obtain explicit review/release approval with open manual evidence separated, then consider controlled merge and exact-production regression; never bypass strict live music gates.

## 2026-11-04 · v0.4.35 default UI2 isolated candidate; initial CI contract/continuity fixes

- **Goal:** Deliver reviewed modern UI2 as default homepage with `?ui2=0` classic opt-out, version/cache-safe assets and strict browser/music/release checks.
- **Changes:** Nonproduction branch `release/fymusic-ui2-default-v0435-20261104`, code commit `05ae29cf`; updated HTML bootstrap and UI2 presentation JS, version metadata, cache revision, exact UI2 contract/theme tests and new 16-case browser default/legacy gate plus isolated Preview workflow. No change to audio/resolver/lyrics. Corrected a stale hardcoded v0.4.34 test assertion in follow-up `7d5a35ef`. This document-only checkpoint states v0.4.35 so the existing privacy-check version policy remains enforced.
- **Tests:** Initial RC #41793142739 FAILED stale test-contract version, privacy #41793142733 FAILED missing v0.4.35 handoff mention; both are classified as release-blocking and are addressed on the branch. At checkpoint creation, newer exact-head tests were NOT yet confirmed. Main production v0.4.34 unchanged. Latest official CI #41791887065 FAILED strict intermittent real MG playback even though earlier official #41786525697 run attempt 2 SUCCESS. Do not claim universal provider reliability.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/commit/05ae29cf7240cb3852a31f4f97eddbc8e3fe262f ; https://github.com/lxhlw/Only-testing-online-music/commit/7d5a35ef868de71e3ca9e6c2bd84efe1c5a27924 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41793142739 .
- **Not done:** Candidate exact-head green CI; live isolated Preview verification; PR merge; default UI2 production activation; real screen-reader/physical-performance measurements.
- **Status:** v0.4.35 candidate only, not production; CI must turn GREEN before merge.
- **Next action:** Re-run strict local/deployed Chrome+WebKit default/legacy tests, privacy, real Migu original live audio+lyrics and safe cross-source fallback. Preserve reversible release and clear source provenance.

## 2026-11-04T15:20:45+08:00 · Official v0.4.34 real Migu production acceptance passed after bounded diagnosis

- **Goal:** Recheck live Migu audio+timed-lyric failures in the official production release without weakening strict assertions; isolate upstream variability before modifying playback.
- **Changes:** Created diagnostic-only branch `diagnostic/fymusic-migu-prod-20261104` at `a875f7a4`, modifying only `scripts/test-migu-lyrics-preview-live.mjs` and adding `.github/workflows/fymusic-migu-production-diagnostic.yml`. Script records allowlisted, bounded resolver/audio event types and numerical LRC timing, never raw URLs or credentials. No production player, lyrics relay, metadata or runtime modifications. Re-ran existing failed main publication job without code changes. Updated CURRENT, LOG and release checklist as public-safe documentation, not product code.
- **Tests:** Standalone live production + immutable-preview strict [#41790673511](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41790673511) **SUCCESS**, both with original Migu `开始懂了` real playback, 55 timed lyrics, cover, pause/resume; official 6122ms and Preview 6673ms for LRC, each after 2 official upstream attempts, and direct original-Migu audio progress. Original mandatory official [#41786525697](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41786525697) **attempt 2 SUCCESS** on unchanged main `98b1dfd386d2509f0821ec634ed610c02866f144`; full production deployed version/assets/404, browser/security and strict Migu gate passed. Earlier mandatory failures remain documented and signify intermittent live-source availability. Static scan of changed public-safe docs was clean; automated post-handoff privacy check is launched by main doc commit.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/commit/a875f7a4dffb55b8f50b37619427378fc91e964f ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41790673511 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41786525697 ; https://only-testing-online-music.pages.dev/?ui2=1 .
- **Not done:** UI2 is not homepage-default; no physical device/real-screen-reader/CPU/FPS/memory validation, no proof of stable upstream SLAs, no rollback performed, diagnostic branch not merged.
- **Status:** Production v0.4.34 deployed, original critical live Migu acceptance **PASS on current runtime SHA**. One technical launch stage remains: default UI2 activation with reversible legacy escape hatch, independent review and production regression. No runtime changes in this operation.
- **Next action:** Activate default UI2 in an isolated PR (opt-out `?ui2=0`, no new audio node), recheck both theme/browser/mobile/real-source and static 404 gates before controlled merge/deploy; preserve non-destructive revert baseline.

## 2026-11-04 · Controlled PR #122 merge and production v0.4.34 verification (mandatory live gate failing)

- **Goal:** Proceed on a limited go-ahead, merge the reviewed v0.4.34 candidate safely and verify actual official Cloudflare Pages while keeping strict music acceptance and rollback.
- **Changes:** GitHub [PR #122](https://github.com/lxhlw/Only-testing-online-music/pull/122) merged with exact head `b83ae5a3`, merge commit `e060b74c` on `main`; pre-merge main `f27f528e` retained as baseline. Official Cloudflare Pages deployed v0.4.34. No rollback was performed. Added public-safe evidence and unresolved status to CURRENT/LOG/release checklist; no private user data or signed provider URLs.
- **Tests:** Exact release-branch preview #41781719596, full #41781725591, playlist #41781725549 and privacy #41781725539 SUCCESS at candidate SHA; exact merged-main handoff privacy #41785369728 SUCCESS. Production [workflow #41785369692](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41785369692) **FAILURE, attempts 1 and 2** despite successful deploy, production version metadata 0.4.34, branded 404 repository protection and browser/security checks. Attempt 1 strict MG real LRC HTTP **502 upstream_timeout** (2 upstream attempts). One same-code retry attempt 2 strict MG real music playback did **not** progress within 35 seconds, `readyState=0`; recorded as FAILED, not flaky-pass.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/commit/e060b74c66cb0868b9f70385205a344f078a187b ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41785369692 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41781719596 ; official https://only-testing-online-music.pages.dev/ ; UI2 opt-in https://only-testing-online-music.pages.dev/?ui2=1 .
- **Not done:** Mandatory green official MG timed lyrics/audio and no new provider failures, default UI2 enablement (still opt-in), physical-device tap/FPS/CPU/memory/real screen-reader verification, tested rollback. Third-party source failures remain.
- **Status:** **PARTIAL ROLLOUT / STRICT PRODUCTION ACCEPTANCE FAILED**; production v0.4.34 deployed, browser/security verified; default visitor UI remains legacy unless `?ui2=1`.
- **Next action:** Diagnose real-source Migu relay/audio intermittence without mocking/weaking real acceptance; run a successful official strict test before marking release complete. Design a separate default UI2 activation with safe opt-out and cache/CI checks. Retain previous main commit as safe non-destructive revert baseline if release code regressions are demonstrated.

## 2026-11-04 · Preliminary visual experience accepted; full release signoff remains open

- **Goal:** Record explicit human acceptance of the latest UI2 visual/basic experience, distinguish it from unobserved physical-device/accessibility testing, and preserve a precise release-ready handoff.
- **Changes:** Sanitized visual-review decision recorded in release checklist, CURRENT and append-only LOG. No changes to candidate source, player, CSS, GitHub Actions requirements, Cloudflare settings, or production application.
- **Tests:** Existing exact candidate `b83ae5a3` green: integrated preview #41781719596, independent browser/audio/security #41781725591, playlist #41781725549, handoff privacy #41781725539. The 320px first-load welcome card and scroll/touch simulation passed. Last observed latest main run #41782506139 was pending; no invented new CI or hardware/a11y results. Public-safe privacy preflight on these documents passed locally by exact-text policy patterns; a new GitHub privacy run is triggered by this handoff commit.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/122 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41781719596 ; https://395bab85.only-testing-online-music.pages.dev/?ui2=1 ; `docs/FYMUSIC_RELEASE_ACCEPTANCE.md`.
- **Not done:** Physical 320px tap/actual-device FPS CPU memory evaluation, real screen reader, explicit final release authorization, merge/deploy v0.4.34, official site verification or rollback exercise.
- **Status:** Human visual/basic-experience: PROVISIONALLY ACCEPTED. Overall production release: HOLD. Production remains v0.4.33; **2 remaining release steps** (device/a11y evidence or explicit acceptance of unknowns, controlled deployment with production checks).
- **Next action:** Record bounded real-device/accessibility findings without identifying data, then request explicit authorization for the final controlled production release, recheck exact-head checks and retain non-destructive rollback.

## 2026-11-04T13:55:29+08:00 · 320px UI2 initial welcome card no longer behind dock, exact candidate gates green

- **Goal:** Resolve the screenshot-observed 320×640 search-card/footer overlap with the fixed mini player before manual/device release acceptance.
- **Changes:** Candidate-only commit `b83ae5a3`: ultra-narrow UI2 portrait CSS compact welcome card without changing the mini player/audio; strict browser test ensures that at 320×640 **before scrolling**, the entire card ends at least 8px above the fixed player. Retains existing 8 simulated-touch/browser/theme paths. Added verified before/after notes to visual evidence report and current handoff on main, no production UI2 release.
- **Tests:** Exact candidate `b83ae5a3` completed integrated local+deployed CI #41781719596 **SUCCESS** with local and Preview Chromium/WebKit 320/390 dark/light touches, visual nonoverlap gate, real KG `稻香`→KW played, real MG `开始懂了` played + 55 timed lyric lines/cover/pause/resume. Full browser/audio/security #41781725591 SUCCESS, playlist #41781725549 SUCCESS, privacy #41781725539 SUCCESS. Inspected refreshed synthetic 320px dark+light screenshots in new artifact **13298609705**: card footer visible before dock. Twelve sampled frame P95/max <=17ms, 0 over50ms; one audio, no overflow. This is CI, not physical-device performance evidence.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/commit/b83ae5a3a1a576c7f934f771a8b8ab5c58c5c780 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41781719596 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41781725591 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41781725549 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41781725539 ; new immutable preview https://395bab85.only-testing-online-music.pages.dev/?ui2=1 ; artifact 13298609705.
- **Not done:** Human visual/device signoff, real narrow physical touch/real screen reader, realistic device FPS/CPU/memory, production PR merge, official v0.4.34 deployment and live verification/rollback rehearsal. Upstream music is not guaranteed.
- **Status:** Exact-head automated acceptance GREEN; official production v0.4.33 unchanged. Stage 6 release **HOLD** pending manual consent. Two remaining release gates.
- **Next action:** Review fixed preview on actual 320px/phone and desktop, verify playable artwork/lyrics/keyboard/real screen reader/physical performance and provide explicit sanitized acceptance. Only then recheck and merge PR #122 and verify official production/revert baseline.

## 2026-11-04 · Stage 6 visual screenshot evidence review (no human signoff)

- **Goal:** Inspect latest exact-head v0.4.34 CI screenshot artifacts and browser frame measurements before proceeding toward manual design/device acceptance.
- **Changes:** No candidate/application runtime changes. Downloaded nonproduction visual audit artifact 13297496074, inspected its 11 PNGs and 12 measurement rows, wrote public-safe review document `docs/FYMUSIC_STAGE6_VISUAL_EVIDENCE_20261104.md` and refreshed CURRENT/LOG on main.
- **Tests:** Candidate `f29b946d` had previously passed exact-head integrated preview #41776071222, browser/security #41776077197, playlist #41776077208 and handoff privacy #41776077220. Latest production-main #41776811441 and handoff privacy #41776811474 were SUCCESS before this docs-only commit. Visual inspection is manual review of **synthetic screenshots**, NOT physical device signoff; 12 CI frame samples P95 <=17ms and 0 samples >50ms, no horizontal overflow or duplicate audio nodes. 320px mini dock visibly covers lower recommendation card in initial viewport; scroll-to-reveal simulation passed in earlier CI, actual touch needs checking.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41776071222 ; screenshot artifact ID 13297496074 ; https://github.com/lxhlw/Only-testing-online-music/pull/122 ; `docs/FYMUSIC_STAGE6_VISUAL_EVIDENCE_20261104.md`.
- **Not done:** Manual human design acceptance, physical-device 320px tap test, real screen-reader test, real-device FPS/CPU/memory, production merge/deployment/version and audio security smoke or rollback exercise. No claim of universal source availability.
- **Status:** Candidate automated checks green, **Stage 6 RELEASE HOLD**. Production remains v0.4.33.
- **Next action:** Authorized reviewer tests the candidate on real desktop/mobile and reports an explicit sanitized pass/fail with any defects. Only after approval merge and verify v0.4.34, keeping revert-ready baseline.

## 2026-11-04T13:00:36+08:00 · Stage 6 strict candidate automation green, manual release gate still open

- **Goal:** Resolve the previous CI failure, verify current v0.4.34 candidate on actual preview/browser/audio/security without compromising test strictness, and prepare safe release continuity.
- **Changes:** Candidate-only commit `f29b946d` enhances exact Migu target-search acceptance with event-driven completion/error signals, sanitized bounded diagnostic summary and maximum three title/artist requests. Only the live test script changed; player, source adapters, lyric relay and production runtime are untouched. Previously implemented 320/390 simulated-touch checks remain enforced.
- **Tests:** Previous integrated RC #41774132268 FAILED because real MG search returned no exact target; browser/security #41774137444, playlist #41774137620 and privacy #41774137469 all passed at older SHA `115ca174`. **Current exact HEAD `f29b946d`:** integrated preview #41776071222 SUCCESS; full browser/security #41776077197 SUCCESS; playlist #41776077208 SUCCESS; privacy #41776077220 SUCCESS. Actual search audit: first title query returned 20 Migu-native rows and exact song. Migu LRC 55 timed lines / HTTP 200 after 2 upstream attempts; real audio progression, cover, correct play/pause and resume passed. Real KG `稻香` → KW recovery played with cover and 48 timed lines. Simulated touch Chromium/WebKit at 320/390 in both themes passed 8 cases on local and deployed preview. CI browser results and short frame-gap samples do NOT establish physical-device FPS/CPU/memory or real screen-reader usability.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/commit/f29b946d41205b7c9e790129014bfa89a2466682 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41776071222 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41776077197 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41776077208 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41776077220 ; preview https://4da74e08.only-testing-online-music.pages.dev/?ui2=1 .
- **Not done:** Human visual signoff, real 320px physical-device touch reachability, real screen-reader navigation and device FPS/CPU/memory; PR merge, official v0.4.34 deployment, production acceptance or rollback exercise. Provider intermittence remains and final rechecks are required.
- **Status:** All current candidate automated checks PASS; Stage 6 **RELEASE HOLD** for manual acceptance. Official site remains v0.4.33; main change in this operation is handoff-only.
- **Next action:** Human/device approval of the immutable UI2 preview; then recheck exact head and run controlled PR #122 merge, verify official production/live source/security, retain non-destructive revert option.

## 2026-11-04 12:36 Asia/Singapore · Resolved release PR documentation conflict without production changes

- **Goal:** Remove an observed PR #122 merge blocker while retaining all source/UI tests and the current public-safe recovery state.
- **Changes:** Compared PR baseline `b1dd0adda` with public main `a802705f`: only three documentation files differed. Created a legitimate two-parent merge on the release candidate `115ca174`, with the candidate application tree retained and three current public documentation files synchronized from main. No app code edited, no production release.
- **Tests:** GitHub returned `mergeable=true` and `unstable` (checks pending, not a pass). Exact SHA handoff privacy #41774137469 and #41774132280 SUCCESS; full browser #41774137444, playlist #41774137620 and integrated preview #41774132268 still running or pending at checkpoint creation. Older SHA automated passes are not transferable.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/commit/115ca174a1b66fab1b1cbd3cf499f297262f66ce ; https://github.com/lxhlw/Only-testing-online-music/pull/122 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41774132268 .
- **Not done:** Exact new HEAD CI completion, physical-device and real screen-reader review, human visual signoff, production merge, production verification or rollback exercise.
- **Status:** RELEASE HOLD; candidate merge conflict resolved, main remains v0.4.33.
- **Next action:** Verify latest exact-head Actions and test evidence, then obtain real-device/human acceptance before any release.

## 2026-11-04 12:28 Asia/Singapore · Stage 6 simulated touch preflight and release acceptance checklist

- **Goal:** Continue the single remaining UI2 release gate safely without inventing physical-device results.
- **Changes:** Candidate-only new browser test `scripts/test-ui2-touch-reachability-browser.mjs` (`aee22337`), CI integration (`45b44b15`), covering Chromium/WebKit 320/390 dark/light dock and scroll-to-reveal hit-testing plus mobile navigation/settings theme taps. Docs-only main checkpoint provides a public-safe manual release checklist. No player runtime modified.
- **Tests:** Baseline RC #41694637948 SUCCESS at `e6745688`; new exact-head RC #41773345937 PENDING at writing. Latest main #41695690319 FAILED real Migu LRC HTTP 502; main public handoff privacy #41695690297 SUCCESS. Do not claim the candidate touch test has passed yet.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/commit/45b44b15e7d6eb1fc6d6afd8d6ac332e3659b979 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41773345937 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41695690319 .
- **Not done:** New touch-gate CI outcome; physical-device tap/FPS/CPU/memory, actual screen reader, human visual acceptance, production merge/deploy and postrelease verification. Provider quality never equates to actual measured bitrate.
- **Status:** RELEASE HOLD, production v0.4.33 unchanged by this documentation operation.
- **Next action:** Inspect exact-head candidate CI and remedy any observable hit-target failures; request human device acceptance from sanitized checklist; merge and production verify only after signoff.

## 2026-11-04 · v0.4.34 final integrated candidate all automated gates green; release held for device approval

- **Goal:** Run final v0.4.34 UI2/source candidate with coherent versioned assets, strict live providers, security and privacy, then prepare safe user-reviewable release.
- **Changes:** Branch `release/fymusic-stage5-stage6-rc-20261104` head `e6745688` contains UI2 light/dark desktop/tablet/mobile, bounded Migu LRC and provider recovery, version.json/package/app-version/HTML v0.4.34 plus updated UI2 contract assertions. PR #122 marked READY FOR REVIEW and evidence documented; no production code merge.
- **Tests:** Exact head preview #41694637948 SUCCESS: local/deployed Chromium+WebKit UI2, theme a11y, keyboard, reduced motion, no overflow, 404/static asset guard, single audio; real KG `稻香`→KW playable audio/cover/48 timed LRC and Migu `开始懂了` audio/cover/55 timed LRC/pause/resume. Prior v0.4.34 full browser/security #41694285132 SUCCESS, playlist #41694285353 SUCCESS, privacy #41694404264 SUCCESS. First earlier v0.4.33 integrated live Daoxiang attempt failed then rerun passed; upstream flakiness remains.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41694637948 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41694285132 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41694285353 ; https://github.com/lxhlw/Only-testing-online-music/pull/122 . Synthetic screenshots artifact #13261185210.
- **Not done:** Physical-device FPS/memory/CPU, real screen-reader and 320px touch reachability, human design approval, production merge, production version/site verification or rollback exercise. Do NOT call Stage 6 production completed.
- **Status:** Stage 5 technical and Stage 6 AUTOMATED acceptance completed; Stage 6 official RELEASE HOLD. Main remains v0.4.33.
- **Next action:** Human/device review of https://d8b9d8d9.only-testing-online-music.pages.dev/?ui2=1 ; only after acceptance merge PR #122, validate official production and preserve revert rollback.

## 2026-11-04 · Integrated RC acceptance passed; ready for human review, production held

- **Goal:** Finish automated provider and UI2 regression on the same release candidate, then preserve exact evidence and rollback plan.
- **Changes:** PR #122 promoted from draft to READY FOR REVIEW after automation gates passed, not merged. The combined source/UI code remains on isolated branch SHA `deb461c5d553c5141bce150a63bcc56eeb029d73`; no production code mutation.
- **Tests:** Cloudflare integrated preview #41691565640 attempt 1 FAILED real Daoxiang fallback; rerun attempt 2 SUCCESS, including real Daoxiang Kuwo recovery and real Migu audio/55 timed lyrics/cover/pause/resume, plus both themes and responsive Chromium/WebKit/UI2 security. Independent full browser/security #41691576704 SUCCESS, playlist #41691576698 SUCCESS. Clean screenshot artifact #13256519117. Tests don't establish universal media reliability or physical-device FPS.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41691565640 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41691576704 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41691576698 ; https://github.com/lxhlw/Only-testing-online-music/pull/122 .
- **Not done:** Human device visual/real screen-reader review, physical FPS/CPU/memory acceptance, v0.4.34 release bump/cache-busters, production merge, production retest and rollback exercise. Source fluctuation means periodic verification remains useful.
- **Status:** Stage 5 automated gate PASSED for tested recordings. Stage 6 remains **RELEASE HOLD** until manual/device signoff; main stays v0.4.33.
- **Next action:** User or authorized reviewer inspects Cloudflare RC preview and real devices; then version bump on RC, re-run final CI and live-source checks, merge the approved PR, verify production and keep revert-ready baseline.

## 2026-11-04 · Stage 5/6 integrated RC, strict real-source release blocker

- **Goal:** Execute source-reliability and UI2 final acceptance together, without premature production promotion.
- **Changes:** Staged Migu LRC bounded retry and metadata-gated Migu/Kugou→Kuwo recovery with UI2 dark/light desktop/tablet/mobile on isolated RC draft PR #122. CI workflow deploys immutable Cloudflare preview and saves synthetic design screenshots. Source fix PR #121 and UI2 PR #116 remain independent drafts.
- **Tests:** Integrated RC full browser/audio/security #41691576704 SUCCESS; playlist #41691576698 SUCCESS. Preview #41691565640 passed UI2 Chromium/WebKit screen, theme/a11y, 404 and Migu audio/55 timed lyric acceptance. The strict real Daoxiang KG→KW test FAILED despite direct Kuwo control playing; retry attempt #2 pending. Prior source preview #41690937874 separately recorded Migu and Daoxiang real pass lines but overall cancelled due later branch update.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/pull/122 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41691565640 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41691576704 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41691576698 .
- **Not done:** Reconcile intermittent provider identity/playback, pass live Daoxiang without reducing strictness, physical-device FPS/memory, real screen-reader/manual visual signoff, release version bump, main merge and production acceptance.
- **Status:** SAFE RELEASE HOLD — production remains v0.4.33; only docs checkpoint committed on main.
- **Next action:** Inspect exact rerun status; diagnose candidate metadata/recovery ordering; rerun both real-provider checks and full CI. Only after acceptance and device/user signoff merge and verify production with rollback.

## 2026-11-04 · Stage 5A live preview: LRC restored in one sample, audio progress blocked

- **Goal:** Evaluate a live, isolated Cloudflare Preview rather than count deterministic mocks as provider success.
- **Changes:** Created draft PR #121 and a nonproduction Migu reliability workflow. Added strictly limited media-state diagnostic (readyState/networkState/error code/paused/progress and source enum only) after audio timeout; ensured independent strict Daoxiang fallback test runs even if Migu test fails after a successful preview deploy.
- **Tests:** Preview #41689359962 deployed successfully. Migu unit, asset allowlist and public-handoff privacy check PASSED. Real Migu acceptance passed the lyric API assertions and then FAILED waiting 35s for actual audio progress. Full browser PR CI was superseded by later branch commits; newest rechecks PENDING. No false audio success claim.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41689359962 ; https://github.com/lxhlw/Only-testing-online-music/pull/121 .
- **Status:** Source reliability Stage 5 remains IN PROGRESS. Do not release branch to production. UI2 PR #116 is separate and still draft.
- **Next action:** Read newest preview and PR CI logs for safe audio-state reason and Daoxiang real fallback. If audio is still unavailable, inspect source resolver state and implement bounded appropriately matched recovery without weakening playback-progress checks. Stage 6 acceptance/release remains after Stage 5.

## 2026-11-04 · Stage 5A Migu LRC bounded retry and sanitized diagnostics

- **Goal:** Diagnose recurring Migu HTTP 502 without leaking upstream details; improve recoverability from transient errors.
- **Changes:** Separate developer branch `fix/fymusic-migu-lrc-bounded-retry-20261104` based on main 4527495d. On Migu CDN-only LRC function, classify failures using safe reason enums, retry once on 429/500/502/503/504 and transport timeout/network failure, 4.25s attempt deadline. Never broaden URL allowlist or follow redirects. Keep strict media and timed lyric acceptance.
- **Tests:** Added unit coverage for 503 recovery, exhausted retry, 404 no retry, exception sanitization. Updated live test to include only a fixed reason category and attempt count; it still fails unless timed lyrics, real audio progress, cover and pause/resume all succeed. CI PENDING at record creation; no actual provider success is yet claimed.
- **Evidence:** Main #41686835515 FAILED strict Migu HTTP 502; main #41685131793 passed. Developer commits aefb6de9, 084cecc5, 6d1a2c08 (code/tests) and e781f47d (handoff); pull request and CI to be checked next.
- **Status:** Isolated feature work only; official production remains v0.4.33; UI2 PR #116 remains draft.
- **Next action:** Open a draft PR, run browser/security, privacy and real-source gates; interpret result without weakening real music playback acceptance. Then diagnose any remaining upstream reliability gaps and complete Stage 6 final approval.
 
## 2026-11-04 · Handoff checkpoint gate fix

- **Goal:** Restore the mandatory public-handoff privacy workflow after the Stage 4 review checkpoint.
- **Changes:** Aligned CURRENT headings with the literal privacy-check contract (Snapshot / Current limitations / Next goal / Next chat) without weakening any secret scan or changing player code.
- **Tests:** Initial main privacy run #41686615247 FAILED only on missing literal Next goal heading; log at scripts/check-handoff-privacy.mjs:29, not a detected secret. New revision re-check PENDING at commit time.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41686615247 ; check source scripts/check-handoff-privacy.mjs.
- **Status:** Fix committed; await latest CI privacy result. Prior production release #41685131793 completed SUCCESS at its docs-only code baseline.
- **Next action:** Confirm the next privacy run PASS, then start Stage 5 Migu HTTP 502 and Kuwo live musicUrl reliability diagnostics.

## 2026-11-04 · Stage 4 automated verification closed; source-reliability triage opened

- **Goal:** Reconcile pending Stage 4 CI, visually inspect retained synthetic screenshots, check latest production failures and refresh a safe cross-chat checkpoint.
- **Changes:** No application code or production UI changes. Current-state handoff reconciled from actual GitHub runs; PR #116 stays draft and unmerged.
- **Tests:** Stage4 preview #41684255301 SUCCESS at d1f6f58c; full browser/security #41684265856 SUCCESS; playlist #41684265845 SUCCESS; privacy #41684265860 SUCCESS. Chromium/WebKit light tests at 1440/820/390/320, 10.81:1 tested heading contrast; CI visual audit artifact #13254972843 inspected. CI rAF data is not physical-device performance.
- **Evidence:** https://github.com/lxhlw/Only-testing-online-music/actions/runs/41684255301 ; https://github.com/lxhlw/Only-testing-online-music/actions/runs/41684265856 ; https://github.com/lxhlw/Only-testing-online-music/pull/116 . Main run #41682617224 failed a REAL Migu lyrics assertion (HTTP 502 / no timed lines), distinct from UI2; #41685131793 was still pending at review.
- **Not done:** Manual screen-reader and real device testing, human visual approval, 320px scroll/reachability investigation, PR conflict resolution (mergeable_state dirty), provider failure root-cause analysis, production merge/deploy.
- **Next:** Begin Stage 5 real-source 502/Kuwo musicUrl diagnostics without exposing signed requests, preserve strict acceptance; Stage 6 final approved release remains afterward.

## 2026-11-04 · Stage 4 accessible UI2 light theme — initial checkpoint (tests pending)

- **Goal:** Build a high-contrast daylight alternative with no change to music playback.
- **Code:** [Draft PR #116](https://github.com/lxhlw/Only-testing-online-music/pull/116) feature SHA `d1f6f58c`. Theme preview query, topbar/Settings controls, ARIA/keyboard/persistence, desktop/tablet/phone and album/lyric light surfaces; no new audio nodes.
- **Tests:** Added Chromium+WebKit light test at 1440, 820, 390 and 320px (contrast, accessible controls, preferences, reduced motion, no overflow). Full stage-4 preview and browser CI **PENDING**; only privacy and playlist currently SUCCESS. CI screenshots are sanitized.
- **Stage 3 closure:** Last visual polish workflow #41681958521 is now SUCCESS at `5de9af04`, not indefinitely in progress as old checkpoint said.
- **New finding:** Production main workflow #41682617224 FAILED; inspect detailed job step before diagnosing. Do not weaken real media tests to make results green.
- **Not done:** Visual/physical-device approval, full screen-reader inspection, external source reliability work, production merge.
- **Next:** Finish stage4 CI and review screenshots, publish verified outcome, then two remaining macro-stages: source reliability; final accepted production rollout.

## 2026-11-04 · Stage 3 tablet continuity and visual/performance audit

- **Goal:** Make UI 2.0 dark-first design continuous across 741–980px tablet widths and produce actual screenshots with bounded CI rendering measurements.
- **Code:** draft [PR #116](https://github.com/lxhlw/Only-testing-online-music/pull/116), feature baseline `5e80697b`, later visual fix `5de9af04` (polish CI pending). Main production stays v0.4.33.
- **Verified:** [preview #41679764057](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41679764057) SUCCESS; [full browser/security #41679773945](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41679773945) SUCCESS; [playlist #41679774062](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41679774062) SUCCESS. Verified 12 Chromium/WebKit viewport samples, no horizontal overflow; CI P95 frame gaps 16.7–17ms, no >50ms gap. Do NOT equate CI sample with real user FPS.
- **Visual review:** Saved public-safe UI screenshot ZIP as short-retention Actions artifact, manually inspected desktop/tablet/mobile. Corrected clipped tablet nav label and light source/quality badges (legacy runtime removes `global-status` class during status updates; CSS fix supports `status.ready/warn/fail`).
- **Issue:** Strict real fallback `稻香` failed in separate run #41681089874 due upstream alternative musicUrl unavailable; earlier baseline passed. Do not silence this inconsistency or misattribute to UI CSS.
- **Current polish status:** [CI #41681958521](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41681958521) pending at checkpoint; inspect result and record later.
- **Not done:** Optional light theme, physical device performance, upstream provider reliability, human design approval and production release.
- **Next (3 macro-stages):** (1) light-theme + accessible polish; (2) provider diagnostics and resilience; (3) complete verification, human sign-off and safe release.

## 2026-11-04 · UI 2.0 phase 2 discovery, library and mobile preview verified

- **Goal:** Continue the tested phase 1 design to search/songs, playlists, ranking, library/settings and responsive phone listening experience without replacing music data or player code.
- **Changes:** [DRAFT PR #116](https://github.com/lxhlw/Only-testing-online-music/pull/116), branch `feature/fymusic-ui2-desktop-preview-20261104`, verified SHA `9bc207d7`. Scoped `src/ui2-preview.css` additions; mobile drawer/search/cards, compact floating Dock, cover-first now-playing, desktop dark collection surfaces; no audio JS or data logic changes. Added deterministic desktop/390px/320px Chromium+WebKit browser tests, style contract and preview workflow.
- **Tests:** [Phase 2 preview #41676240585](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41676240585) SUCCESS; [full browser/security #41676250254](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41676250254) SUCCESS; [playlist #41676250284](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41676250284) SUCCESS. Cloudflare deployed browser tests, 404 guard, single media element, no horizontal overflow, lyrics/artwork, and Kugou `稻香`→Kuwo playback with 48 timed lyric rows passed.
- **Issue/fix:** Initial preview #41675764216 failed only during live stylesheet check due to `curl | grep -q` premature pipe closing; corrected with download-to-file then grep. Retested successfully.
- **Preview:** https://fc82ed4d.only-testing-online-music.pages.dev/?ui2=1. Production `main` remains v0.4.33 without UI2.
- **Independent production issue:** Main workflow #41673691537 browser/security passed, but real Migu song playback timed out; do not ascribe to UI-only branch. Last prior successful main run #41670345575.
- **Not done:** Human visual review, tablet band, complete light theme, actual FPS/memory measurement, UI2 production merge; no claim of universal high-bitrate source.
- **Next action:** Review deployed preview on desktop/mobile; measure performance; refine tablet/light theme and address production Migu diagnostics separately. Keep draft PR until approved.

## 2026-11-04 · UI 2.0 desktop preview shipped to isolated Cloudflare branch (verified)

- **Goal:** Implement the first cinematic desktop UI while preserving audio, native player state, covers, synchronized lyrics and source recovery.
- **Code:** `feature/fymusic-ui2-desktop-preview-20261104`, [draft PR #116](https://github.com/lxhlw/Only-testing-online-music/pull/116), tested SHA `1d13ee4f`.
- **Changes:** `src/ui2-preview.css`, `src/ui2-preview.js` and opt-in `?ui2=1` links in `index.html`. Deep-toned immersive Now Playing, floating Dock, cover-colored static ambience, conditional UI lifecycle, no animation timers; mobile baseline unchanged.
- **Verified:** [Preview workflow #41672796071](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41672796071) SUCCESS. Chromium/WebKit desktop+mobile UI, live preview security 404, single audio node, art/lyric visibility, play/pause/resume, reduced motion. [Browser/security #41672843044](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41672843044), [playlist #41672843520](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41672843520), [privacy #41672843842](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41672843842) all SUCCESS.
- **Real source:** `稻香` Kugou error recovered into Kuwo alternate audio (progress), cover loaded, 48 timed lyrics. A `128k` request was observed, not measured codec/bitrate.
- **Preview:** [isolated UI 2.0 test site](https://821da531.only-testing-online-music.pages.dev/?ui2=1); `main` and official production remain v0.4.33.
- **Not done:** Visual sign-off, actual FPS/performance measurements, mobile UI 2.0, search/library redesign, merging or deploying to production.
- **Next action:** User design review of preview, then refine desktop and implement phase 2 mobile/search/library with new CI gates. Update handoff after the next milestone.

## 2026-11-03 · Handoff protocol established

- **Input / motivation:** Future conversations must recover technical progress after a context limit, without relying exclusively on chat memory.
- **Repository verified:** `lxhlw/Only-testing-online-music` is PUBLIC. No accessible PRIVATE repository was found at initialization.
- **Action:** Added a public-safe current-state checkpoint, an append-only operation log, recovery instructions, privacy policy and a secret-pattern check. The public README links to the handoff.
- **Deliverable:** `docs/HANDOFF_CURRENT.md`, `docs/HANDOFF_LOG.md`, `docs/HANDOFF_POLICY.md`, `scripts/check-handoff-privacy.mjs`, `.github/workflows/handoff-privacy.yml`.
- **Data protection:** Deliberately excludes personal identifiers, private conversations, private Figma file identifiers, access tokens, sensitive URLs, unshared files and account data. Technical details are already public in this project's repository/history.
- **Baseline verification:** v0.4.33 main `e67071dd`; release Actions run #41650815801 `completed / success`. Privacy static scan is required for this checkpoint change.
- **Status:** Documentation/protocol setup; does NOT implement UI 2.0.
- **Open issue:** The current repository cannot provide private storage. Use a separate PRIVATE repository for future confidential notes, once available and authorized.
- **Next action:** On a UI 2.0 feature branch, implement the desktop now-playing frame and floating player as an isolated preview. Update these documents in the same change before declaring that operation complete.

## 2026-11-03 · UI 2.0 design prototype

- **Goal:** Improve modern desktop/mobile visual quality and animation while preserving music playback.
- **Completed:** Five editable design screens: desktop dark discover, desktop dark immersive player, mobile discover, mobile now-playing and desktop light theme, plus motion/performance/accessibility guidance in Figma.
- **Not completed:** No implementation or animation is live; no changes to production UI from this design step.
- **Next action:** Build and verify the separate UI 2.0 preview; do not publish design work to the production domain until tests pass.

## 2026-11-03 · v0.4.33 autoplay and audio-quality regression fix

- **Code:** [PR #114](https://github.com/lxhlw/Only-testing-online-music/pull/114), main baseline commit `e67071dd`.
- **Verified:** `NotAllowedError` resume, `NotSupportedError` handling, `AbortError` classification, declared-quality-first selection, preview `稻香` alternative playback with cover and 48 lyric lines, production regression pass.
- **Evidence:** [main release run #41650815801](https://github.com/lxhlw/Only-testing-online-music/actions/runs/41650815801) `success`.
- **Limitation:** The real alternative source returned a 128k request in that test; actual encoding/bitrate was not measured. Browser autoplay restrictions can require a direct user gesture.

## 2026-11-03 · Historical Pages files guard

- **Code:** [PR #113](https://github.com/lxhlw/Only-testing-online-music/pull/113).
- **Verified:** Public README and old repository paths receive protected 404 responses in preview and production, normal player app files continue static delivery.
- **Next action:** Retain the strict allowlist and guard during UI 2.0 changes.

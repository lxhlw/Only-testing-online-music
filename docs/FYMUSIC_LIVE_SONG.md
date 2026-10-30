# FyMusic real song diagnostic (Phase 1.4)

Case: 孙燕姿《开始懂了》 on WY, TX, KG using unmodified Flower source.

This is an **informational** GitHub Actions workflow. Green CI only means
the test harness completed: it does not prove a song can play.

1. Open the FyMusic development branch in Chromium via local Cloudflare Pages.
2. Explicitly install and activate the original Flower script.
3. Request **highest declared quality**, with current app fallback allowed.
4. Search real catalogues via real browser UI, only select matching song title
   and artist; do not substitute another track when exact match is absent.
5. Use real click-to-play handlers, real Flower musicUrl request and real media.
6. Read the existing FyMusic evidence report after a bounded connection window.
7. Save an allowlisted JSON report without IDs, raw URLs, media bytes, headers,
   source scripts, untrusted error bodies or credentials.

Limitations: search result title/artist and resolver metadata do not prove
actual media identity; an HTML5 audio clock advancing is stronger evidence
than a URL but still does not guarantee audible audio. Source failures, missing
tracks, quality mismatches and network restrictions are recorded independently.

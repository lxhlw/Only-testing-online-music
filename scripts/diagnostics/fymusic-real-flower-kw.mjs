import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Live-only evidence gate. No route.fulfill(), mock resolvers, fixture audio,
// pre-seeded song IDs, cross-platform auto-switch, or raw media URL logging.
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788';
const TARGET = { title: '开始懂了', artist: '孙燕姿' };
const FLOWER = 'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js';
const MIRROR = 'https://ghproxy.net/raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js';
const evidence = {
  target: TARGET, sourceImported: false, sourceImportAttempts: [], sourceTransportStatuses: [], sourceSupportsKg: false,
  sourceSupportsKw: false, kgSearch: false, kgSelected: false,
  manualSearchOffered: false, manualSearchClicked: false,
  manualCandidateCount: 0, candidateConfirmed: false,
  actualKwAttempt: false, actualKwUrl: false,
  actualKwMedia: false, decodedProgress: false,
  qualityRequests: [], resolverEvents: [], flowerProxy: [], mediaResponses: [],
  playback: null, performance: { timingsMs: {}, requestCounts: {
    kgFlowerProxy: 0, kwFlowerProxy: 0, kwCatalogSearch: 0, mediaRequests: 0
  }, longTasks: { count: 0, maxDurationMs: 0 } }, result: 'NOT_STARTED'
};
const stageMarks = {};
const markStage = name => { stageMarks[name] = performance.now(); };
const elapsed = (begin, end) => Number.isFinite(stageMarks[begin]) &&
  Number.isFinite(stageMarks[end])
  ? Math.round(stageMarks[end] - stageMarks[begin]) : null;
const addDurations = () => {
  evidence.performance.timingsMs = {
    flowerImport: elapsed('flowerImportBegin', 'flowerImportReady'),
    kgCatalogSearch: elapsed('kgCatalogBegin', 'kgCatalogReady'),
    kgFailureToAlternateOffer: elapsed('kgClick', 'alternateOffer'),
    kwManualSearchToCandidates: elapsed('kwSearchClick', 'kwCandidatesReady'),
    kwConfirmationToAudioReady: elapsed('kwConfirmClick', 'kwAudioReady'),
    kwConfirmationToVerifiedPlayback: elapsed('kwConfirmClick', 'kwPlaybackVerified'),
    kgSelectionToVerifiedKwPlayback: elapsed('kgClick', 'kwPlaybackVerified')
  };
};
const bounded = (list, item, limit = 16) => {
  if (list.length < limit) list.push(item);
};
const safeErrorCode = e => String(e?.message || e || '').includes('Timeout')
  ? 'TIMEOUT' : 'CHECK_FAILED';
const browser = await chromium.launch({
  headless: true, args: ['--autoplay-policy=no-user-gesture-required']
});
let page;
try {
  page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', () => bounded(pageErrors, 'PAGE_ERROR'));
  page.on('request', request => {
    // Count actual requests without storing any URL, IDs, tags or signatures.
    try {
      if (request.resourceType() === 'media')
        evidence.performance.requestCounts.mediaRequests++;
      const requestUrl = new URL(request.url());
      if (requestUrl.pathname !== '/api/proxy') return;
      const upstream = new URL(requestUrl.searchParams.get('url') || '');
      if (upstream.hostname === 'search.kuwo.cn' &&
          upstream.pathname === '/r.s')
        evidence.performance.requestCounts.kwCatalogSearch++;
      if (upstream.pathname.includes('/flower/') &&
          /\/url\/(?:kg|kw)(?:\/|$)/i.test(upstream.pathname)) {
        const source = /\/url\/kw(?:\/|$)/i.test(upstream.pathname)
          ? 'kwFlowerProxy' : 'kgFlowerProxy';
        evidence.performance.requestCounts[source]++;
      }
    } catch { /* do not log sensitive request data */ }
  });

  // Observe transport metadata only. Never serialize URL, query or response body.
  page.on('response', async response => {
    try {
      const request = response.request();
      const parsed = new URL(response.url());
      if (['raw.githubusercontent.com', 'ghproxy.net'].includes(parsed.hostname) &&
          parsed.pathname.includes('/pdone/lx-music-source/') &&
          parsed.pathname.includes('/flower/latest.js')) {
        bounded(evidence.sourceTransportStatuses, {
          via: parsed.hostname === 'raw.githubusercontent.com' ? 'github-raw' : 'mirror',
          status: response.status()
        });
      }
      if (parsed.pathname === '/api/proxy') {
        const target = new URL(parsed.searchParams.get('url') || '');
        if (target.pathname.includes('/pdone/lx-music-source/') &&
            target.pathname.includes('/flower/latest.js')) {
          bounded(evidence.sourceTransportStatuses, { via: 'same-origin-proxy', status: response.status() });
        }
        if (target.pathname.includes('/flower/') && /\/url\/(?:kg|kw)(?:\/|$)/i.test(target.pathname)) {
          const platform = /\/url\/kw(?:\/|$)/i.test(target.pathname) ? 'kw' : 'kg';
          let diagnostic = null;
          if (response.status() >= 400) {
            const body = await response.json().catch(() => null);
            if (typeof body?.diagnostic === 'string' && /^FLOWER_[A-Z0-9_]{1,60}$/.test(body.diagnostic))
              diagnostic = body.diagnostic;
          }
          bounded(evidence.flowerProxy, { platform, status: response.status(), diagnostic });
        }
      }
      if (request.resourceType() === 'media') {
        const headers = response.headers();
        const type = String(headers['content-type'] || '').split(';')[0].toLowerCase();
        bounded(evidence.mediaResponses, {
          status: response.status(),
          contentType: /^(audio\/|application\/(?:octet-stream|ogg|x-mpegurl|vnd.apple.mpegurl))/.test(type) ? 'media' : 'other'
        });
      }
    } catch { /* telemetry must never affect playback */ }
  });

  evidence.result = 'BOOTSTRAP';
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForFunction(() => Boolean(
    window.LXSourceManager?.installFromUrl &&
    window.LXPlaySettings?.save &&
    window.LXMusicSearch?.search &&
    window.FyMusicCrossPlatformMatch?.inspect
  ), null, { timeout: 18000 });

  await page.evaluate(() => {
    window.__fymusicPerfStats = { count: 0, maxDurationMs: 0 };
    try {
      const observer = new PerformanceObserver(entries => {
        for (const entry of entries.getEntries()) {
          window.__fymusicPerfStats.count++;
          window.__fymusicPerfStats.maxDurationMs =
            Math.max(window.__fymusicPerfStats.maxDurationMs, entry.duration);
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch { /* optional modern browser performance API */ }
    window.__fymusicRealEvents = [];
    for (const name of [
      'fymusic:alternate-search', 'fymusic:alternate-approved',
      'fymusic:resolver-attempt', 'fymusic:resolver-error', 'fymusic:url-resolved'
    ]) {
      window.addEventListener(name, event => {
        const d = event.detail || {};
        const allowed = {};
        for (const key of ['source', 'quality', 'from', 'to', 'code', 'status', 'transport', 'provider'])
          if (typeof d[key] === 'string' || typeof d[key] === 'number') allowed[key] = d[key];
        window.__fymusicRealEvents.push({ name, detail: allowed });
      });
    }
    // Preserve app default high-MP3 behaviour, without forcing 128k.
    window.LXPlaySettings.save({ qualityMode: 'highest', autoFallback: true });
  });

  evidence.result = 'FLOWER_IMPORT';
  markStage('flowerImportBegin');
  const flower = await page.evaluate(async ({ url, mirror }) => {
    const mgr = window.LXSourceManager;
    const attempts = [];
    function snapshot(item) {
      return { codePresent: String(item?.code || '').length > 100,
        runtimePresent: !!item?.runtime, initialized: !!item?.inited,
        kgDeclared: !!item?.sources?.kg, kwDeclared: !!item?.sources?.kw,
        hasError: !!item?.error };
    }
    function compatible(item) {
      return !!(item?.inited && item.runtime &&
        item.sources?.kg?.actions?.includes('musicUrl') &&
        item.sources?.kw?.actions?.includes('musicUrl'));
    }
    async function ready(item, deadlineMs = 12000) {
      const started = Date.now();
      while (Date.now() - started < deadlineMs) {
        const active = mgr.getActive();
        if (compatible(item)) return item;
        if (compatible(active) && /pdone\/lx-music-source\/main\/flower\/latest\.js/.test(
          String(active.url || ''))) return active;
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      return item;
    }
    let item = mgr.getActive();
    if (compatible(item) && /pdone\/lx-music-source\/main\/flower\/latest\.js/.test(String(item.url || '')))
      return { ok: true, kg: true, kw: true, usedExisting: true, attempts };
    for (const address of [url, mirror]) {
      const result = await new Promise(resolve => {
        mgr.installFromUrl(address, (err, installed) => resolve({ err: !!err, installed,
          errorKind: err ? (/timeout/i.test(String(err.message || err)) ? 'timeout' :
            /network|fetch|http/i.test(String(err.message || err)) ? 'transport' :
              'runtime_or_parser') : null }));
      });
      if (result.err || !result.installed) {
        attempts.push({ transport: address === url ? 'raw' : 'mirror',
          status: 'install_failed', reason: result.errorKind });
        continue;
      }
      item = mgr.activate(result.installed.id);
      item = await ready(item);
      attempts.push({ transport: address === url ? 'raw' : 'mirror',
        status: compatible(item) ? 'ready' : 'not_ready', ...snapshot(item) });
      if (compatible(item)) return { ok: true, kg: true, kw: true,
        usedExisting: false, attempts };
    }
    item = mgr.getActive();
    return { ok: false, kg: !!item?.sources?.kg, kw: !!item?.sources?.kw, attempts };
  }, { url: FLOWER, mirror: MIRROR });
  evidence.sourceImportAttempts = flower.attempts;
  evidence.sourceImported = flower.ok;
  evidence.sourceSupportsKg = flower.kg;
  evidence.sourceSupportsKw = flower.kw;
  assert.ok(flower.ok, 'FLOWER_IMPORT_OR_KG_KW_ACTION_UNAVAILABLE');
  markStage('flowerImportReady');

  // Real catalog search; preserve selected page row rather than injecting IDs.
  evidence.result = 'KG_SEARCH';
  markStage('kgCatalogBegin');
  let rows = 0;
  for (const keyword of ['孙燕姿 开始懂了', '开始懂了']) {
    await page.locator('#channel-list .channel-button[title="KG"]').click();
    await page.locator('#global-search-input').fill(keyword);
    await page.locator('#global-search-btn').click();
    try {
      await page.locator('.search-song-row').first().waitFor({ timeout: 16000 });
    } catch { continue; }
    rows = await page.locator('.search-song-row')
      .filter({ hasText: TARGET.title })
      .filter({ hasText: TARGET.artist }).count();
    if (rows > 0) break;
  }
  evidence.kgSearch = rows > 0;
  assert.ok(evidence.kgSearch, 'REAL_KG_SEARCH_TARGET_NOT_FOUND');
  markStage('kgCatalogReady');

  evidence.result = 'KG_RESOLUTION';
  const row = page.locator('.search-song-row')
    .filter({ hasText: TARGET.title })
    .filter({ hasText: TARGET.artist }).first();
  // Prefer the precise studio title and artist; do not click unrelated Live versions.
  const rowText = await row.innerText();
  assert.ok(rowText.includes(TARGET.title) && rowText.includes(TARGET.artist),
    'REAL_KG_SELECTED_ROW_MISMATCH');
  assert.ok(!/\bLive\b|现场版|演唱会|翻唱/i.test(rowText),
    'REAL_KG_VERSION_NOT_STUDIO');
  markStage('kgClick');
  await row.locator('.search-song-main').click();
  evidence.kgSelected = true;
  const button = page.locator('.fymusic-alternate-search');
  try {
    await button.waitFor({ timeout: 30000 });
  } catch {
    const state = await page.evaluate(() => {
      const a = document.querySelector('#audio');
      return { source: window.__LXNowPlayingTrack?.source || null,
        mediaReady: !!(a && a.readyState >= 2 && a.currentTime > 0) };
    });
    throw new Error(state.mediaReady && state.source === 'kg'
      ? 'KG_ALREADY_PLAYING_NO_KW_RECOVERY_REQUIRED'
      : 'KG_FAILED_BUT_MANUAL_KW_ENTRY_MISSING');
  }
  evidence.manualSearchOffered = true;
  markStage('alternateOffer');
  evidence.result = 'KW_MANUAL_SEARCH';
  let history = await page.evaluate(() => window.__fymusicRealEvents);
  assert.equal(history.filter(x => x.name === 'fymusic:alternate-search').length, 0,
    'KW_SEARCH_STARTED_BEFORE_CLICK');
  assert.equal(history.filter(x => x.name === 'fymusic:alternate-approved').length, 0,
    'KW_APPROVED_BEFORE_CLICK');
  markStage('kwSearchClick');
  await button.click();
  evidence.manualSearchClicked = true;
  const firstCandidate = page.locator('.fymusic-alternate-confirm').first();
  try {
    await firstCandidate.waitFor({ timeout: 13000 });
  } catch {
    throw new Error('REAL_KW_SEARCH_NO_STRICT_MATCH_OR_TIMED_OUT');
  }
  markStage('kwCandidatesReady');
  evidence.manualCandidateCount = await page.locator('.fymusic-alternate-confirm').count();
  assert.ok(evidence.manualCandidateCount <= 3 && evidence.manualCandidateCount >= 1,
    'KW_CANDIDATE_COUNT_UNEXPECTED');
  history = await page.evaluate(() => window.__fymusicRealEvents);
  assert.equal(history.filter(x => x.name === 'fymusic:alternate-approved').length, 0,
    'KW_AUTO_APPROVAL_DETECTED');

  evidence.result = 'KW_REAL_RESOLUTION';
  markStage('kwConfirmClick');
  await firstCandidate.click();
  evidence.candidateConfirmed = true;
  try {
    await page.waitForFunction(() => {
      const a = document.querySelector('#audio');
      return window.__LXNowPlayingTrack?.source === 'kw' &&
        a && a.readyState >= 2 && !a.error && !a.paused &&
        a.currentTime >= 1 && Number.isFinite(a.duration) && a.duration >= 120;
    }, null, { timeout: 42000 });
  } catch {
    throw new Error('REAL_KW_URL_OR_MEDIA_NOT_DECODED');
  }
  markStage('kwAudioReady');
  const before = await page.evaluate(() => document.querySelector('#audio').currentTime);
  await page.waitForTimeout(3300);
  const playback = await page.evaluate(() => {
    const a = document.querySelector('#audio');
    return {
      source: window.__LXNowPlayingTrack?.source || null,
      readyState: a?.readyState ?? null, paused: a?.paused ?? null,
      errorCode: a?.error?.code ?? null, durationSeconds: a?.duration ?? null,
      currentSeconds: a?.currentTime ?? null, bufferedEndSeconds:
        a?.buffered?.length ? a.buffered.end(a.buffered.length - 1) : 0
    };
  });
  evidence.playback = playback;
  history = await page.evaluate(() => window.__fymusicRealEvents);
  evidence.resolverEvents = history;
  evidence.qualityRequests = history
    .filter(x => x.name === 'fymusic:resolver-attempt')
    .map(x => ({ platform: x.detail.source, quality: x.detail.quality }));
  evidence.actualKwAttempt = evidence.qualityRequests.some(x => x.platform === 'kw');
  evidence.actualKwUrl = history.some(x =>
    x.name === 'fymusic:url-resolved' && x.detail.source === 'kw');
  evidence.actualKwMedia = evidence.mediaResponses.some(x =>
    [200, 206].includes(x.status) && x.contentType === 'media');
  evidence.decodedProgress = playback.source === 'kw' &&
    playback.readyState >= 2 && playback.errorCode == null &&
    !playback.paused && playback.currentSeconds - before >= 2 &&
    playback.durationSeconds >= 120;
  assert.ok(evidence.actualKwAttempt, 'NO_REAL_KW_RESOLVER_ATTEMPT');
  assert.ok(evidence.actualKwUrl, 'NO_REAL_KW_RESOLVED_URL');
  assert.ok(evidence.actualKwMedia, 'NO_REAL_MEDIA_HTTP_200_OR_206');
  assert.ok(evidence.decodedProgress, 'NO_REAL_KW_AUDIO_PROGRESS');
  // One user confirmation should not cause duplicate KW catalog lookups or
  // redundant Flower resolver HTTP calls. Count actual browser requests.
  assert.equal(evidence.performance.requestCounts.kwCatalogSearch, 1,
    'DUPLICATE_OR_MISSING_KW_CATALOG_REQUEST');
  assert.equal(evidence.performance.requestCounts.kwFlowerProxy, 1,
    'DUPLICATE_OR_MISSING_KW_FLOWER_REQUEST');
  assert.equal(history.filter(x => x.name === 'fymusic:alternate-search').length, 1,
    'DUPLICATE_KW_SEARCH_ACTION');
  assert.equal(history.filter(x => x.name === 'fymusic:alternate-approved').length, 1,
    'DUPLICATE_KW_CONFIRM_ACTION');
  markStage('kwPlaybackVerified');
  assert.deepEqual(pageErrors, [], 'UNCAUGHT_BROWSER_ERRORS');
  evidence.result = 'REAL_KW_DECODED_PROGRESS_PASS';
} catch (error) {
  evidence.failure = safeErrorCode(error);
  evidence.result = evidence.result === 'NOT_STARTED' ? 'BOOTSTRAP_FAILED' : evidence.result + '_FAILED';
  // Fixed safe diagnostic classification; never log arbitrary error text.
  const allowed = [
    'FLOWER_IMPORT_OR_KG_KW_ACTION_UNAVAILABLE',
    'REAL_KG_SEARCH_TARGET_NOT_FOUND',
    'REAL_KG_SELECTED_ROW_MISMATCH', 'REAL_KG_VERSION_NOT_STUDIO',
    'KG_ALREADY_PLAYING_NO_KW_RECOVERY_REQUIRED',
    'KG_FAILED_BUT_MANUAL_KW_ENTRY_MISSING',
    'REAL_KW_SEARCH_NO_STRICT_MATCH_OR_TIMED_OUT',
    'KW_CANDIDATE_COUNT_UNEXPECTED', 'KW_AUTO_APPROVAL_DETECTED',
    'KW_SEARCH_STARTED_BEFORE_CLICK', 'KW_APPROVED_BEFORE_CLICK',
    'REAL_KW_URL_OR_MEDIA_NOT_DECODED',
    'NO_REAL_KW_RESOLVER_ATTEMPT', 'NO_REAL_KW_RESOLVED_URL',
    'NO_REAL_MEDIA_HTTP_200_OR_206', 'NO_REAL_KW_AUDIO_PROGRESS',
    'UNCAUGHT_BROWSER_ERRORS',
    'DUPLICATE_OR_MISSING_KW_CATALOG_REQUEST',
    'DUPLICATE_OR_MISSING_KW_FLOWER_REQUEST',
    'DUPLICATE_KW_SEARCH_ACTION',
    'DUPLICATE_KW_CONFIRM_ACTION'
  ];
  evidence.failureCode = allowed.includes(error?.message) ? error.message : evidence.failure;
} finally {
  if (page) {
    const safe = await page.evaluate(() => (window.__fymusicRealEvents || [])
      .filter(x => x.name === 'fymusic:resolver-attempt' ||
                   x.name === 'fymusic:resolver-error' ||
                   x.name === 'fymusic:url-resolved')
    ).catch(() => []);
    evidence.resolverEvents = safe.slice(0,16);
    evidence.qualityRequests = safe
      .filter(x => x.name === 'fymusic:resolver-attempt')
      .map(x => ({ platform: x.detail.source, quality: x.detail.quality }));
    evidence.actualKwAttempt = evidence.qualityRequests.some(x => x.platform === 'kw');
    evidence.actualKwUrl = safe.some(x =>
      x.name === 'fymusic:url-resolved' && x.detail.source === 'kw');
  }
  addDurations();
  if (page) {
    const longTaskStats = await page.evaluate(() => window.__fymusicPerfStats || null)
      .catch(() => null);
    if (longTaskStats) {
      evidence.performance.longTasks = {
        count: Math.min(999, Number(longTaskStats.count) || 0),
        maxDurationMs: Math.round(Number(longTaskStats.maxDurationMs) || 0)
      };
    }
  }
  console.log('FYMUSIC_REAL_FLOWER_KW_EVIDENCE ' + JSON.stringify(evidence));
  await browser.close();
}
if (evidence.result !== 'REAL_KW_DECODED_PROGRESS_PASS') process.exitCode = 1;

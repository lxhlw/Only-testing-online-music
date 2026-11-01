import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Startup-only CPU profile. Do not navigate to songs, collect session tokens,
// log raw script URLs or serialize the Chrome profile to CI artifacts.
const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788';
const baseUrl = new URL(BASE);
assert.ok((['localhost','127.0.0.1'].includes(baseUrl.hostname)) ||
  (baseUrl.hostname.endsWith('.only-testing-online-music.pages.dev') &&
   baseUrl.hostname !== 'only-testing-online-music.pages.dev'),
  'STARTUP_PROFILE_MUST_NOT_TARGET_PRODUCTION');
const browser = await chromium.launch({ headless: true });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const session = await page.context().newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: 1000 });
  await session.send('Profiler.start');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForFunction(() =>
    Boolean(window.LXSourceManager?.getActive && window.LXMusicSearch?.search &&
      window.OnlyTestingMusicApp), null, { timeout: 18000 });
  await page.waitForTimeout(1000);
  const { profile } = await session.send('Profiler.stop');
  const timing = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find(p => p.name === 'first-contentful-paint');
    return {
      domContentLoadedMs: n ? Math.round(n.domContentLoadedEventEnd) : null,
      loadMs: n ? Math.round(n.loadEventEnd) : null,
      firstContentfulPaintMs: fcp ? Math.round(fcp.startTime) : null,
      scriptTagCount: document.scripts.length
    };
  });
  const normalizeSource = value => {
    if (!value) return 'inline';
    try {
      const pathname = new URL(value).pathname;
      if (pathname === '/' || pathname === '/index.html') return 'inline-index';
      if (pathname.startsWith('/src/'))
        return pathname.slice(1).replace(/[^a-zA-Z0-9_./-]/g, '').slice(0,72);
      if (pathname.startsWith('/vendor/')) return 'vendor';
    } catch { /* virtual scripts contain untrusted URLs */ }
    return 'other';
  };
  // CDP samples reference node IDs. A sample is a millisecond-scale estimate,
  // not proof that a given function produced an individual long task.
  const nodes = new Map((profile.nodes || []).map(n => [n.id,n]));
  const totals = new Map();
  let sampled = 0;
  for (const id of profile.samples || []) {
    const frame = nodes.get(id)?.callFrame || {};
    // CDP emits idle/GC/program samples without a script URL. Counting
    // them as inline JavaScript would falsely attribute idle CPU to FyMusic.
    if (!frame.url) continue;
    const source = normalizeSource(frame.url);
    if (source === 'other' || source === 'inline') continue;
    sampled++;
    const fn = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(frame.functionName || '')
      ? frame.functionName : '(anonymous)';
    const key = source + '::' + fn;
    totals.set(key, (totals.get(key) || 0) + 1);
  }
  const hottest = [...totals.entries()]
    .sort((a,b) => b[1]-a[1])
    .slice(0,10)
    .map(([key, samples]) => ({
      component: key.split('::')[0],
      function: key.split('::')[1],
      sampledMsApprox: samples
    }));
  console.log('FYMUSIC_STARTUP_CPU_PROFILE ' + JSON.stringify({
    timing, approxFirstPartyCpuSampleMs: sampled, hottest
  }));
} finally {
  await browser.close();
}

import { chromium } from 'playwright'

const base = process.env.TEST_BASE_URL || 'https://only-testing-online-music.pages.dev'
const started = Date.now()
const maxWaitMs = Number(process.env.MIGU_PROBE_TIMEOUT_MS || 120000)
const failures = []
const errors = []
const requests = []
const resolverReplies = []
const mediaFailures = []
const sanitized = url => {
  try {
    const parsed = new URL(url)
    if (parsed.pathname === '/api/proxy') {
      const target = new URL(parsed.searchParams.get('url'))
      return target.origin + target.pathname
    }
    return parsed.origin + parsed.pathname
  } catch {
    return '<unparseable>'
  }
}

const direct = await fetch(
  new URL('/api/proxy?url=' + encodeURIComponent('https://music.gdstudio.xyz/time'), base),
  { signal: AbortSignal.timeout(14000) }
).then(async response => ({
  status: response.status,
  type: response.headers.get('content-type'),
  snippet: (await response.text()).slice(0, 300)
})).catch(e => ({ error: String(e) }))
console.log('DIRECT NODE PROXY TIME:', JSON.stringify(direct))

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.addInitScript(() => {
  const events = []
  const timers = {}
  const nativeSet = window.setTimeout
  const nativeClear = window.clearTimeout
  window.__miguDeadlineTrace = events
  window.setTimeout = function (callback, delay) {
    if (Number(delay) !== 25000) return nativeSet.apply(this, arguments)
    let id
    const wrapped = function () {
      events.push({ event: 'fire', elapsed: Math.round(performance.now()) })
      delete timers[id]
      return callback.apply(this, arguments)
    }
    id = nativeSet.call(this, wrapped, delay)
    timers[id] = true
    events.push({ event: 'arm', elapsed: Math.round(performance.now()) })
    return id
  }
  window.clearTimeout = function (id) {
    if (timers[id]) {
      events.push({ event: 'clear', elapsed: Math.round(performance.now()) })
      delete timers[id]
    }
    return nativeClear.apply(this, arguments)
  }
})
page.on('pageerror', error => errors.push(String(error)))
page.on('response', async response => {
  if (!response.url().includes('/api/proxy?url=')) {
    if (response.request().resourceType() === 'media' && response.status() >= 400) {
      mediaFailures.push({ target: sanitized(response.url()), status: response.status() })
    }
    return
  }
  const entry = {
    target: sanitized(response.url()),
    method: response.request().method(),
    status: response.status(),
    requestOrigin: response.request().headers()['origin'] || '',
    requestFetchSite: response.request().headers()['sec-fetch-site'] || '',
  }
  requests.push(entry)
  if (response.status() >= 200 && response.status() < 300 &&
    /(?:migu|onrender\.com)/i.test(entry.target) && resolverReplies.length < 18) {
    try {
      const result = await response.json()
      const summarize = data => {
        if (Array.isArray(data)) return { arrayLength: data.length }
        if (!data || typeof data !== 'object') return { type: typeof data }
        const out = { keys: Object.keys(data).slice(0, 20) }
        for (const k of ['code', 'msg', 'message', 'error', 'success', 'status']) {
          if (data[k] !== undefined) out[k] = String(data[k]).slice(0, 100)
        }
        for (const k of ['url', 'playUrl', 'listenUrl', 'audioUrl']) {
          if (typeof data[k] === 'string') {
            try { out[k + 'Host'] = new URL(data[k]).hostname }
            catch { out[k + 'Format'] = data[k] ? 'non-absolute-url' : 'empty' }
          }
        }
        return out
      }
      resolverReplies.push({
        target: entry.target,
        body: summarize(result),
        data: summarize(result?.data)
      })
    } catch (e) {
      resolverReplies.push({ target: entry.target, parseError: String(e).slice(0, 100) })
    }
  }
  if (response.status() >= 400 && failures.length < 24) {
    let body = ''
    try { body = (await response.text()).slice(0, 320) } catch (e) { body = 'unreadable response' }
    failures.push({ ...entry, body })
  }
})

try {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 35000 })
  await page.locator('.nav-item[data-view="settings"]').click()
  await page.locator('#verified-install-btn').click()
  await page.waitForFunction(() => {
    const a = window.LXSourceManager?.getActive?.()
    return a && a.inited && a.sources && a.sources.mg
  }, null, { timeout: 12000 })
  await page.locator('.nav-item[data-view="search"]').click()
  await page.locator('#channel-list button[title="MG"]').click()
  await page.locator('#global-search-input').fill('成都')
  await page.locator('#global-search-btn').click()
  await page.waitForFunction(() => {
    const row = document.querySelector('#search-results .search-row')
    const status = document.querySelector('#status')?.textContent || ''
    return Boolean(row) || /搜索失败/.test(status)
  }, null, { timeout: 45000 })

  // An occasional HTTP 0 from the external Migu search endpoint is a
  // transient network failure and not evidence about the playback deadline.
  // Retry once, then fail explicitly if the provider remains unavailable.
  const firstSearch = await page.evaluate(() => ({
    rows: document.querySelectorAll('#search-results .search-row').length,
    status: document.querySelector('#status')?.textContent || ''
  }))
  if (!firstSearch.rows && /Search API HTTP 0/.test(firstSearch.status)) {
    console.log('HUIBQ MG SEARCH NETWORK RETRY: first search returned HTTP 0')
    await page.waitForTimeout(800)
    await page.locator('#global-search-btn').click()
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll('#search-results .search-row').length
      const status = document.querySelector('#status')?.textContent || ''
      return rows > 0 || /搜索失败/.test(status)
    }, null, { timeout: 45000 })
  }

  const initial = await page.evaluate(() => {
    const result = window.__LXLastSearchResults?.[0] || null
    const active = window.LXSourceManager?.getActive?.()
    return {
      sourceName: active?.name || '',
      songName: result?.name || '',
      source: result?.source || '',
      idPresence: Boolean(result?.id),
      contentIdPresence: Boolean(result?.contentId),
      copyrightIdPresence: Boolean(result?.copyrightId),
      status: document.querySelector('#status')?.textContent || '',
      rows: document.querySelectorAll('#search-results .search-row').length
    }
  })
  console.log('HUIBQ MG SEARCH:', JSON.stringify(initial))
  if (!initial.rows) throw new Error('Migu search returned no results')

  // Observe the *first actual terminal UI transition*. Prior diagnostics
  // incorrectly searched for "无法提供可用地址" but the page displays
  // "暂无可用的播放地址", then kept polling until its own 45s cutoff.
  await page.evaluate(() => {
    const status = document.querySelector('#status')
    const start = performance.now()
    window.__miguTerminalTiming = { elapsedMs: null, textKind: '' }
    new MutationObserver(() => {
      const value = status?.textContent || ''
      if (window.__miguTerminalTiming.elapsedMs !== null) return
      if (/暂无可用的播放地址|无法提供可用地址|咪咕播放已等待|备用解析失败/.test(value)) {
        window.__miguTerminalTiming.elapsedMs = Math.round(performance.now() - start)
        window.__miguTerminalTiming.textKind = /咪咕播放已等待/.test(value) ? 'timeout' : 'no_media_url'
      }
    }).observe(status, {childList: true, characterData: true, subtree: true})
  })
  const playStartedAt = Date.now()
  await page.locator('#search-results .search-row').first().locator('.search-actions button').first().click()
  const clickResolvedMs = Date.now() - playStartedAt
  const deadline = Date.now() + maxWaitMs
  let snapshot
  while (Date.now() < deadline) {
    snapshot = await page.evaluate(() => {
      const a = document.querySelector('#audio')
      return {
        status: document.querySelector('#status')?.textContent || '',
        paused: a?.paused,
        currentTime: a?.currentTime,
        audioError: a?.error?.code || 0,
        audioSrcSet: Boolean(a?.currentSrc)
      }
    })
    if ((snapshot.currentTime || 0) > .3 && !snapshot.paused) break
    if (/当前音质无法播放|备用解析失败|无法提供可用地址|暂无可用的播放地址|咪咕播放已等待/.test(snapshot.status)) break
    await page.waitForTimeout(1200)
  }
  console.log('HUIBQ MG PLAY RESULT:', JSON.stringify(snapshot))
  const elapsedMs = Date.now() - playStartedAt
  const firstTerminal = await page.evaluate(() => window.__miguTerminalTiming)
  console.log('HUIBQ MG PLAY LATENCY:', JSON.stringify({
    elapsedMs,
    firstTerminalMs: firstTerminal?.elapsedMs,
    clickResolvedMs,
    terminal: /咪咕播放已等待/.test(snapshot.status) ? 'playback_deadline' :
      (/暂无可用的播放地址/.test(snapshot.status) ? 'no_media_url' : 'other'),
    hasAudioProgress: Boolean(snapshot.currentTime > .3 && !snapshot.paused)
  }))
  // Verify the exact LX source call, not only the application's native
  // fallback. LX desktop's Migu SDK populates songmid with songId and keeps
  // copyrightId separately. Huibq resolves hash ?? songmid.
  const sourceCall = await page.evaluate(() => {
    const song = window.__LXLastSearchResults?.[0]
    const active = window.LXSourceManager?.getActive?.()
    const list = active?.runtime?.__debugRequests || []
    const request = list.findLast
      ? list.findLast(item => /\/url\/mg\//.test(item.url))
      : [...list].reverse().find(item => /\/url\/mg\//.test(item.url))
    if (!song || !request) return { observed: false }
    const url = new URL(request.url)
    const match = url.pathname.match(/\/url\/mg\/([^/]+)\//)
    const requested = match ? decodeURIComponent(match[1]) : ''
    return {
      observed: true,
      songmidPresent: Boolean(song.songmid),
      copyrightIdPresent: Boolean(song.copyrightId),
      distinctIds: String(song.songmid) !== String(song.copyrightId),
      usesSongmid: requested === String(song.songmid),
      usesCopyrightId: requested === String(song.copyrightId),
      customUserAgent: /^lx-music-/.test(String(request.headers?.['User-Agent'] || ''))
    }
  })
  console.log('HUIBQ MG SOURCE PARITY:', JSON.stringify(sourceCall))
  if (process.env.MIGU_EXPECT_DESKTOP_PARITY === 'true') {
    if (!sourceCall.observed || !sourceCall.songmidPresent ||
        !sourceCall.usesSongmid || !sourceCall.customUserAgent) {
      throw new Error('The imported Huibq source request differs from LX Desktop: ' +
        JSON.stringify(sourceCall))
    }
  }

  console.log('PROXY ERRORS:', JSON.stringify(failures))
  console.log('PROXY REQUEST SUMMARY:', JSON.stringify(requests.slice(-70)))
  console.log('RESOLVER 200 BODY SHAPES:', JSON.stringify(resolverReplies))
  console.log('MEDIA FAILURES:', JSON.stringify(mediaFailures))
  console.log('BROWSER ERRORS:', JSON.stringify(errors))
  const timingTrace = await page.evaluate(() => window.__miguDeadlineTrace || [])
  console.log('MIGU DEADLINE TRACE:', JSON.stringify(timingTrace))
  if (process.env.MIGU_REQUIRE_25S_BOUND === 'true' &&
      !(snapshot.currentTime > .3 && !snapshot.paused)) {
    if (firstTerminal?.elapsedMs == null) {
      throw new Error('Migu terminal UI state was not observed')
    }
    if (firstTerminal.elapsedMs > 32000 || elapsedMs > 34000) {
      throw new Error('Migu terminal status exceeded 32s tolerance: ' +
        JSON.stringify({elapsedMs, firstTerminalMs:firstTerminal.elapsedMs, timingTrace}))
    }
  }
  const playing = Boolean(snapshot && snapshot.currentTime > .3 && !snapshot.paused)
  if (process.env.MIGU_EXPECT_VALID_ID === 'true') {
    const badIds = requests.filter(item => /\/url\/mg\/\//.test(item.target))
    if (badIds.length) throw new Error('Huibq Migu playback sent a request with an empty song ID')
    console.log('PASS: all Huibq Migu playback requests contain a real platform ID')
  }
  if (!playing) {
    if (process.env.MIGU_REQUIRE_PLAYBACK !== 'false') {
      throw new Error('Huibq MG playback not confirmed. Upstream business codes and errors are printed above.')
    }
    if (!/咪咕.*(?:暂无可用的播放地址|播放已等待)/.test(snapshot.status)) {
      throw new Error('Player must show an actionable Migu no-URL explanation: ' + snapshot.status)
    }
    console.log('PASS: unavailable Migu playback is explained without claiming success')
  } else {
    console.log('PASS: Huibq Migu search and real audio playback succeeded')
  }
} finally {
  await page.close()
  await browser.close()
}

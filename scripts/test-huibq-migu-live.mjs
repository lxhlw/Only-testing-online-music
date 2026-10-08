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

  await page.locator('#search-results .search-row').first().locator('.search-actions button').first().click()
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
    if (/当前音质无法播放|备用解析失败|无法提供可用地址/.test(snapshot.status)) break
    await page.waitForTimeout(1200)
  }
  console.log('HUIBQ MG PLAY RESULT:', JSON.stringify(snapshot))
  console.log('PROXY ERRORS:', JSON.stringify(failures))
  console.log('PROXY REQUEST SUMMARY:', JSON.stringify(requests.slice(-70)))
  console.log('RESOLVER 200 BODY SHAPES:', JSON.stringify(resolverReplies))
  console.log('MEDIA FAILURES:', JSON.stringify(mediaFailures))
  console.log('BROWSER ERRORS:', JSON.stringify(errors))
  if (!snapshot || !(snapshot.currentTime > .3 && !snapshot.paused)) {
    throw new Error('Huibq MG playback not confirmed. Diagnostics above identify the upstream or proxy failure.')
  }
  console.log('PASS: Huibq Migu search and real audio playback succeeded')
} finally {
  await page.close()
  await browser.close()
}

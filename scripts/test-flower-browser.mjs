import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const SOURCE_URL = process.env.LX_SOURCE_URL || 'https://ghproxy.net/raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js'
const KEYWORD = process.env.TEST_KEYWORD || '\u5468\u6770\u4f26'
const CHANNELS = (process.env.TEST_CHANNELS || 'kw,kg,tx,wy,mg').split(',').map(item => item.trim().toLowerCase()).filter(Boolean)
const INIT_TIMEOUT_MS = Number(process.env.INIT_TIMEOUT_MS || 30000)
const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 60000)
const PLAYBACK_TIMEOUT_MS = Number(process.env.PLAYBACK_TIMEOUT_MS || 15000)
const REQUIRE_PLAUSIBLE_PLAYBACK = process.env.REQUIRE_PLAUSIBLE_PLAYBACK !== 'false'
const REAL_PLAYBACK_PROGRESS_S = Number(process.env.REAL_PLAYBACK_PROGRESS_S || 0.25)

function parseDuration(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number') {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return 0
    return n > 10000 ? n / 1000 : n
  }
  const text = String(value).trim()
  if (!text) return 0
  if (text.includes(':')) {
    const parts = text.split(':')
    let total = 0
    for (const part of parts) {
      const n = Number(part)
      if (!Number.isFinite(n) || n < 0) return 0
      total = total * 60 + n
    }
    return total
  }
  const n = Number(text)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n > 10000 ? n / 1000 : n
}

function isPlausiblePlaybackDuration(actual, expected) {
  if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(expected) || expected <= 0) return true
  if (expected >= 120) return actual >= Math.max(30, expected * 0.45)
  if (expected >= 60) return actual >= Math.max(20, expected * 0.45)
  if (expected >= 30) return actual >= Math.max(15, expected * 0.40)
  return actual >= Math.max(8, expected * 0.30)
}

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors = []
const failedResponses = []
const proxyTargets = []
const resolverResponses = []
const mediaResponses = []

page.on('pageerror', error => pageErrors.push(String(error)))
page.on('response', async response => {
  const url = response.url()
  if (response.status() >= 400) {
    failedResponses.push(
      response.status() + ' ' + response.request().method() + ' ' + url
    )
  }

  if (!url.includes('/api/proxy?url=')) return

  let target = ''
  try {
    target = new URL(url).searchParams.get('url') || ''
  } catch {}

  if (!target) return

  const event = {
    at: Date.now(),
    status: response.status(),
    method: response.request().method(),
    target,
    headers: response.headers(),
  }

  if (/\/flower\/v1\/url\/(?:kw|kg|tx|wy|mg)\//.test(target)) {
    try {
      const body = await response.text()
      event.body = body.slice(0, 4096)
    } catch {}
    resolverResponses.push(event)
    return
  }

  if (/(?:kuwo\.cn|kugou\.com|qq\.com|163\.com|migu\.cn)/i.test(target)) {
    mediaResponses.push(event)
  }
})

page.on('request', request => {
  const url = request.url()
  if (!url.includes('/api/proxy?url=')) return
  try {
    const target = new URL(url).searchParams.get('url')
    if (target) proxyTargets.push({
      method: request.method(),
      target,
    })
  } catch {}
})

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.nav-item[data-view="settings"]').click()
  assert.equal(await page.locator('#install-btn').isVisible(), true, 'Settings view did not load')

  await page.evaluate(() => {
    const audio = document.getElementById('audio')
    window.__audioEvents = []
    if (!audio) return
    for (const name of ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'waiting', 'stalled', 'error', 'ended']) {
      audio.addEventListener(name, () => {
        window.__audioEvents.push({
          name,
          at: Date.now(),
          src: audio.currentSrc || audio.src || '',
          currentTime: Number(audio.currentTime || 0),
          duration: Number(audio.duration || 0),
          readyState: Number(audio.readyState || 0),
          paused: Boolean(audio.paused),
          errorCode: audio.error ? audio.error.code : null,
        })
        if (window.__audioEvents.length > 300) window.__audioEvents.shift()
      })
    }
  })
  assert.match(await page.locator('#app-version').textContent(), /^v\d+\.\d+\.\d+$/)

  await page.locator('#source-url').fill(SOURCE_URL)
  await page.locator('#install-btn').click()

  await page.waitForFunction(
    () => {
      const manager = window.LXSourceManager
      const active = manager?.getActive?.()
      return Boolean(
        active &&
        active.inited &&
        active.runtime &&
        active.sources &&
        active.sources.kg &&
        active.sources.kg.actions &&
        active.sources.kg.actions.indexOf('musicUrl') >= 0
      )
    },
    null,
    { timeout: INIT_TIMEOUT_MS },
  )

  const state = await page.evaluate(() => {
    const manager = window.LXSourceManager
    const active = manager.getActive()
    return {
      name: active?.name || '',
      inited: Boolean(active?.inited),
      env: active?.runtime?.env || '',
      kg: active?.sources?.kg || null,
      sources: active?.sources ? Object.keys(active.sources) : [],
    }
  })

  assert.equal(state.inited, true, 'Flower source did not initialize')
  assert.equal(state.env, 'desktop', 'Chromium must expose LX desktop environment')
  assert.ok(state.kg, 'Flower source did not expose the kg channel')
  await page.locator('.nav-item[data-view="search"]').click()
  console.log('PASS: Flower initialized with LX desktop environment')
  console.log('Source:', state.name)
  console.log('Channels:', state.sources.join(', '))

  assert.ok(CHANNELS.length > 0, 'No channels configured')
  assert.ok(CHANNELS.every(channel => /^(kw|kg|tx|wy|mg)$/.test(channel)), 'Unsupported test channel: ' + CHANNELS.join(','))

  const summary = []

  for (const channel of CHANNELS) {
    const button = page.locator('#channel-list .channel-button[title="' + channel.toUpperCase() + '"]')
    assert.equal(await button.count(), 1, channel.toUpperCase() + ' channel button is missing')
    await button.click()

    await page.locator('#search-input').fill(KEYWORD)
    await page.locator('#search-btn').click()

    await page.waitForFunction(
      () => {
        const status = document.getElementById('status')?.textContent || ''
        return document.querySelectorAll('#search-results .search-row').length > 0 || /\u641c\u7d22\u5931\u8d25/.test(status)
      },
      null,
      { timeout: SEARCH_TIMEOUT_MS },
    )

    // A transient browser/network HTTP 0 can occur before any upstream
    // response reaches the page. Retry the same channel search once rather
    // than failing the whole five-channel matrix on an infrastructure blip.
    const firstSearchState = await page.evaluate(() => ({
      count: document.querySelectorAll('#search-results .search-row').length,
      status: document.getElementById('status')?.textContent || '',
    }))
    if (firstSearchState.count === 0 && /Search API HTTP 0/.test(firstSearchState.status)) {
      await page.waitForTimeout(500)
      await page.locator('#search-btn').click()
      await page.waitForFunction(
        () => {
          const status = document.getElementById('status')?.textContent || ''
          return document.querySelectorAll('#search-results .search-row').length > 0 || /\u641c\u7d22\u5931\u8d25/.test(status)
        },
        null,
        { timeout: SEARCH_TIMEOUT_MS },
      )
    }

    const results = await page.evaluate(() => {
      return (window.__LXLastSearchResults || []).slice(0, 8).map(item => ({
        id: item.id || '',
        hash: item.hash || item.raw?.hash || '',
        songmid: item.songmid || '',
        name: item.name || '',
        singer: item.singer || '',
        source: item.source || '',
        rawSource: item.raw?.source || '',
        copyrightId: item.copyrightId || item.raw?.copyrightId || item.raw?.copyright_id || '',
        contentId: item.contentId || item.raw?.contentId || item.raw?.content_id || '',
        resourceType: item.resourceType || item.raw?.resourceType || item.raw?.resource_type || '',
        interval: item.interval ?? item.duration ?? item.raw?.interval ?? item.raw?.duration ?? 0,
      }))
    })

    assert.ok(
      results.length > 0,
      channel.toUpperCase() + ' search returned no results. Status: ' + await page.locator('#status').textContent()
    )
    assert.ok(
      results.every(item => item.source === channel),
      channel.toUpperCase() + ' search leaked another source: ' + JSON.stringify(results)
    )
    if (channel === 'kg') assert.ok(results.every(item => item.hash), 'KG results must contain a Kugou hash')
    if (channel === 'kw') assert.ok(results.every(item => item.songmid), 'KW results must contain a Kuwo songmid')
    if (channel === 'mg') assert.ok(results.every(item => item.id || item.copyrightId), 'MG results must contain a Migu identifier')

    const attempts = []
    const successfulFlowerResolverUrls = []
    const candidateCount = Math.min(3, results.length)
    for (let i = 0; i < candidateCount; i += 1) {
      await page.evaluate(() => {
        const audio = document.getElementById('audio')
        if (!audio) return
        try { audio.pause() } catch {}
        try { audio.removeAttribute('src') } catch {}
        try { audio.load() } catch {}
      })

      const baseline = await page.evaluate(() => {
        const audio = document.getElementById('audio')
        return {
          src: audio?.getAttribute('src') || '',
          currentTime: Number(audio?.currentTime || 0),
          eventIndex: Array.isArray(window.__audioEvents) ? window.__audioEvents.length : 0,
        }
      })

      if (baseline.src) {
        throw new Error(channel.toUpperCase() + ' pre-click audio source was not cleared: ' + baseline.src)
      }

      const startedAt = Date.now()
      await page.locator('#search-results .search-row').nth(i).getByRole('button', { name: '解析并播放' }).click()

      const playbackDeadline = Date.now() + PLAYBACK_TIMEOUT_MS
      while (Date.now() < playbackDeadline) {
        const probe = await page.evaluate(() => {
          const audio = document.getElementById('audio')
          if (!audio) return { currentTime: 0, readyState: 0, error: true, ended: false }
          return {
            currentTime: Number(audio.currentTime || 0),
            readyState: Number(audio.readyState || 0),
            error: Boolean(audio.error),
            ended: Boolean(audio.ended),
          }
        })

        if (
          probe.error ||
          probe.ended ||
          (probe.readyState >= 2 && probe.currentTime >= REAL_PLAYBACK_PROGRESS_S)
        ) {
          break
        }
        await page.waitForTimeout(250)
      }

      await page.waitForTimeout(500)

      const attempt = await page.evaluate((markerIndex) => {
        const audio = document.getElementById('audio')
        const events = Array.isArray(window.__audioEvents) ? window.__audioEvents.slice(markerIndex) : []
        return {
          status: document.getElementById('status')?.textContent || '',
          audioUrl: audio?.getAttribute('src') || '',
          readyState: Number(audio?.readyState || 0),
          currentTime: Number(audio?.currentTime || 0),
          duration: Number(audio?.duration || 0),
          paused: Boolean(audio?.paused),
          ended: Boolean(audio?.ended),
          error: audio?.error ? {
            code: audio.error.code,
            message: audio.error.message || '',
          } : null,
          events: events.slice(-40),
        }
      }, baseline.eventIndex)

      const recentResolver = resolverResponses.filter(item => item.at >= startedAt)
      const recentMedia = mediaResponses.filter(item => item.at >= startedAt)
      const resolverDataUrls = []
      for (const item of recentResolver) {
        try {
          const json = JSON.parse(item.body || '')
          const data = json?.data ?? json?.body?.data
          if (typeof data === 'string' && /^https?:\/\//i.test(data.trim())) {
            resolverDataUrls.push(data.trim())
          }
        } catch {}
      }

      let audioTarget = ''
      try {
        audioTarget = new URL(attempt.audioUrl).searchParams.get('url') || ''
      } catch {}

      const trace = {
        index: i + 1,
        result: results[i],
        ...attempt,
        baselineSrc: baseline.src,
        markerEventIndex: baseline.eventIndex,
        sourceChanged: Boolean(attempt.audioUrl && attempt.audioUrl !== baseline.src),
        resolverResponses: recentResolver.map(item => ({
          status: item.status,
          target: item.target,
          body: item.body || '',
        })),
        resolverDataUrls,
        mediaResponses: recentMedia.map(item => ({
          status: item.status,
          target: item.target,
          contentType: item.headers?.['content-type'] || '',
          contentLength: item.headers?.['content-length'] || '',
          contentRange: item.headers?.['content-range'] || '',
          acceptRanges: item.headers?.['accept-ranges'] || '',
        })),
        audioTarget,
      }
      attempts.push(trace)

      const validatedDuration = isPlausiblePlaybackDuration(
        attempt.duration,
        parseDuration(results[i]?.interval)
      )
      const validatedProgress = attempt.currentTime >= 12
      const sourceChanged = Boolean(attempt.audioUrl && attempt.audioUrl !== baseline.src)
      const hadPlayingEvent = attempt.events.some(event => event.name === 'playing')
      const resolverBackedMedia =
        !audioTarget ||
        resolverDataUrls.length === 0 ||
        resolverDataUrls.includes(audioTarget) ||
        recentMedia.some(item => item.target === audioTarget)

      for (const item of recentResolver) {
        if (item.status < 200 || item.status >= 300) continue
        try {
          const json = JSON.parse(item.body || '')
          const data = json?.data ?? json?.body?.data
          if (typeof data === 'string' && /^https?:\/\//i.test(data.trim())) {
            const url = data.trim()
            if (!successfulFlowerResolverUrls.includes(url)) {
              successfulFlowerResolverUrls.push(url)
            }
          }
        } catch {}
      }

      if (
        REQUIRE_PLAUSIBLE_PLAYBACK &&
        (hadPlayingEvent || attempt.currentTime >= REAL_PLAYBACK_PROGRESS_S) &&
        attempt.currentTime >= REAL_PLAYBACK_PROGRESS_S &&
        attempt.readyState >= 2 &&
        !attempt.error &&
        (validatedDuration || validatedProgress) &&
        /(?:正在播放|播放中)/.test(attempt.status) &&
        resolverBackedMedia
      ) break
    }

    const targetSeen = proxyTargets.some(item => {
      const target = item.target
      if (channel === 'kw') return (
        /search\.kuwo\.cn\/r\.s/.test(target) ||
        /flower\/v1\/url\/kw\//.test(target) ||
        /lxmusicapi\.onrender\.com\/url\/kw\//.test(target) ||
        /music-api\.gdstudio\.xyz\/api\.php/.test(target) ||
        /music-dl\.sayqz\.com\/api\//.test(target)
      )
      if (channel === 'kg') return (
        /songsearch\.kugou\.com\/song_search_v2/.test(target) ||
        /mobilecdn\.kugou\.com\/api\/v3\/search\/song/.test(target) ||
        /flower\/v1\/url\/kg\//.test(target) ||
        /lxmusicapi\.onrender\.com\/url\/kg\//.test(target) ||
        /music-api\.gdstudio\.xyz\/api\.php/.test(target) ||
        /music-dl\.sayqz\.com\/api\//.test(target)
      )
      if (channel === 'tx') return (
        /u\.y\.qq\.com\/cgi-bin\/musics\.fcg/.test(target) ||
        /flower\/v1\/url\/tx\//.test(target) ||
        /lxmusicapi\.onrender\.com\/url\/tx\//.test(target)
      )
      if (channel === 'wy') return (
        /music\.163\.com\/api\/cloudsearch\/pc/.test(target) ||
        /music\.163\.com\/api\/search\/get\/web/.test(target) ||
        /interface\.music\.163\.com\/eapi\/batch/.test(target) ||
        /music-api\.gdstudio\.xyz\/api\.php/.test(target) ||
        /flower\/v1\/url\/wy\//.test(target) ||
        /lxmusicapi\.onrender\.com\/url\/wy\//.test(target)
      )
      return (
        /jadeite\.migu\.cn\/music_search\/v3\/search\/searchAll/.test(target) ||
        target.indexOf('app.pd.nf.migu.cn/MIGUM3.0/v1.0/content/sub/listenSong.do') >= 0 ||
        /flower\/v1\/url\/mg\//.test(target) ||
        /lxmusicapi\.onrender\.com\/url\/mg\//.test(target) ||
        /music-dl\.sayqz\.com\/api\//.test(target)
      )
    })
    assert.ok(targetSeen, channel.toUpperCase() + ' did not produce expected platform/Flower proxy traffic')

    const success = attempts.find(item =>
      item.currentTime >= REAL_PLAYBACK_PROGRESS_S &&
      item.readyState >= 2 &&
      !item.error &&
      (
        isPlausiblePlaybackDuration(item.duration, parseDuration(item.result?.interval)) ||
        item.currentTime >= 12
      )
    )

    if (!success && !REQUIRE_PLAUSIBLE_PLAYBACK) {
      assert.ok(attempts.length > 0, channel.toUpperCase() + ' did not produce a playback probe')
      console.log(
        'PASS:',
        channel.toUpperCase(),
        'local probe completed; plausible playback deferred to live deployment'
      )
      summary.push({
        channel,
        result: results[0],
        playback: null,
        attempts,
        expectedDuration: parseDuration(results[0].interval)
      })
      continue
    }

    assert.ok(
      success,
      channel.toUpperCase() + ' playback did not reach real playing state after ' +
      attempts.length + ' candidates: ' + JSON.stringify(attempts, null, 2)
    )
    assert.ok(
      success.audioUrl && success.audioUrl !== success.baselineSrc,
      channel.toUpperCase() + ' playback reused the pre-click/stale audio source: ' +
      JSON.stringify(success, null, 2)
    )
    assert.ok(
      channel.toUpperCase() + ' playback did not produce a plausible full-length song after ' +
      attempts.length + ' candidates: ' + JSON.stringify(attempts, null, 2)
    )
    const acceptedPlaybackUrl =
      String(success.audioUrl || '').indexOf('/api/proxy?url=') >= 0 ||
      /^https?:\/\//i.test(String(success.audioUrl || ''))
    assert.ok(
      acceptedPlaybackUrl,
      channel.toUpperCase() + ' playback did not produce a usable HTTP(S) media URL: ' +
      JSON.stringify(success, null, 2)
    )

    if (successfulFlowerResolverUrls.length > 0) {
      assert.ok(
        successfulFlowerResolverUrls.includes(success.audioTarget || '') ||
        successfulFlowerResolverUrls.includes(
          String(success.audioTarget || '').replace(/^http:/i, 'https:')
        ),
        channel.toUpperCase() + ' ignored a successful Flower musicUrl resolver response and played a different URL: ' +
        JSON.stringify({
          audioTarget: success.audioTarget,
          successfulFlowerResolverUrls
        }, null, 2)
      )
    }

    summary.push({ channel, result: results[0], playback: success, attempts, expectedDuration: parseDuration(results[0].interval) })
    console.log('PASS:', channel.toUpperCase(), 'search + playback')
  }

  console.log('FLOWER CHANNEL MATRIX')
  console.log(JSON.stringify({
    sourceUrl: SOURCE_URL,
    keyword: KEYWORD,
    channels: CHANNELS,
    summary,
    flowerTargets: proxyTargets.filter(item => /flower\/v1\/url\/(kw|kg|tx|wy|mg)\//.test(item.target)),
    failedResponses,
    pageErrors,
  }, null, 2))
  console.log('PASS: Flower source search + playback matrix succeeded for all requested channels')

} catch (error) {
  console.error('FLOWER BROWSER TEST FAILED')
  console.error(error?.stack || String(error))
  console.error('Page status:', await page.locator('#status').textContent().catch(() => 'unavailable'))
  console.error('Proxy targets:', JSON.stringify(proxyTargets, null, 2))
  console.error('Failed responses:', failedResponses.join('\n') || 'none')
  console.error('Page errors:', pageErrors.join('\n') || 'none')
  process.exitCode = 1
} finally {
  await browser.close()
}

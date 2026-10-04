import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const SOURCE_URL = process.env.LX_SOURCE_URL || 'https://ghproxy.net/raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js'
const KEYWORD = '\u5468\u6770\u4f26'
const CHANNELS = (process.env.TEST_CHANNELS || 'kw,kg,tx,wy,mg').split(',').map(item => item.trim().toLowerCase()).filter(Boolean)
const INIT_TIMEOUT_MS = Number(process.env.INIT_TIMEOUT_MS || 30000)
const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 60000)
const PLAYBACK_TIMEOUT_MS = Number(process.env.PLAYBACK_TIMEOUT_MS || 15000)

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors = []
const failedResponses = []
const proxyTargets = []

page.on('pageerror', error => pageErrors.push(String(error)))
page.on('response', response => {
  if (response.status() >= 400) {
    failedResponses.push(
      response.status() + ' ' + response.request().method() + ' ' + response.url()
    )
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
  assert.equal(await page.locator('#install-btn').isVisible(), true, 'App did not load')
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

    const results = await page.evaluate(() => {
      return (window.__LXLastSearchResults || []).slice(0, 8).map(item => ({
        id: item.id || '',
        hash: item.hash || item.raw?.hash || '',
        songmid: item.songmid || '',
        name: item.name || '',
        singer: item.singer || '',
        source: item.source || '',
        rawSource: item.raw?.source || '',
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
    const candidateCount = Math.min(3, results.length)
    for (let i = 0; i < candidateCount; i += 1) {
      await page.locator('#search-results .search-row').nth(i).getByRole('button', { name: '\u89e3\u6790\u5e76\u64ad\u653e' }).click()

      try {
        await page.waitForFunction(
          () => {
            const audio = document.getElementById('audio')
            return Number(audio?.currentTime || 0) >= 0.5 || Boolean(audio?.error)
          },
          null,
          { timeout: PLAYBACK_TIMEOUT_MS },
        )
      } catch {}

      const attempt = await page.evaluate(() => {
        const audio = document.getElementById('audio')
        return {
          status: document.getElementById('status')?.textContent || '',
          audioUrl: audio?.src || '',
          readyState: Number(audio?.readyState || 0),
          currentTime: Number(audio?.currentTime || 0),
          duration: Number(audio?.duration || 0),
          error: audio?.error ? {
            code: audio.error.code,
            message: audio.error.message || '',
          } : null,
        }
      })
      attempts.push({ index: i + 1, result: results[i], ...attempt })
      if (attempt.currentTime >= 0.5 && attempt.readyState >= 2 && !attempt.error) break
    }

    const success = attempts.find(item => item.currentTime >= 0.5 && item.readyState >= 2 && !item.error)
    assert.ok(
      success,
      channel.toUpperCase() + ' playback failed after ' + attempts.length + ' candidates: ' +
      JSON.stringify(attempts, null, 2)
    )
    assert.ok(
      String(success.audioUrl || '').indexOf('/api/proxy?url=') >= 0,
      channel.toUpperCase() + ' playback URL was not normalized through the same-origin media proxy: ' +
      JSON.stringify(success, null, 2)
    )

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
        /music\.163\.com\/api\/search\/get\/web/.test(target) ||
        /interface\.music\.163\.com\/eapi\/batch/.test(target) ||
        /flower\/v1\/url\/wy\//.test(target) ||
        /lxmusicapi\.onrender\.com\/url\/wy\//.test(target)
      )
      return (
        /jadeite\.migu\.cn\/music_search\/v3\/search\/searchAll/.test(target) ||
        /flower\/v1\/url\/mg\//.test(target) ||
        /lxmusicapi\.onrender\.com\/url\/mg\//.test(target) ||
        /music-dl\.sayqz\.com\/api\//.test(target)
      )
    })
    assert.ok(targetSeen, channel.toUpperCase() + ' did not produce expected platform/Flower proxy traffic')

    summary.push({ channel, result: results[0], playback: success, attempts })
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

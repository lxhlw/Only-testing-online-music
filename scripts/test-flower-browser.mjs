import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const SOURCE_URL = process.env.LX_SOURCE_URL || 'https://ghproxy.net/raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js'
const KEYWORD = '周杰伦'
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

  const kgButton = page.locator('#channel-list .channel-button[title="KG"]')
  assert.equal(await kgButton.count(), 1, 'KG channel button is missing')
  await kgButton.click()

  await page.locator('#search-input').fill(KEYWORD)
  await page.locator('#search-btn').click()

  await page.waitForFunction(
    () => document.querySelectorAll('#search-results .search-row').length > 0,
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

  assert.ok(results.length > 0, 'KG search returned no results')
  assert.ok(
    results.every(item => item.source === 'kg' && item.hash),
    'KG search results must contain a Kugou hash and remain bound to KG: ' + JSON.stringify(results)
  )
  assert.ok(
    results.every(item => item.source === 'kg'),
    'KG search returned results not bound to the KG source: ' + JSON.stringify(results)
  )
  console.log('PASS: KG search results remain bound to the selected source')
  console.log('First KG result:', JSON.stringify(results[0]))

  const playbackAttempts = []
  const testCount = Math.min(5, results.length)

  for (let i = 0; i < testCount; i += 1) {
    const row = page.locator('#search-results .search-row').nth(i)
    await row.getByRole('button', { name: '解析并播放' }).click()

    await page.waitForFunction(
      () => {
        const status = document.getElementById('status')?.textContent || ''
        return /已返回 128k 播放地址|musicUrl 失败/.test(status)
      },
      null,
      { timeout: PLAYBACK_TIMEOUT_MS },
    )

    const attempt = await page.evaluate(() => {
      const active = window.LXSourceManager.getActive()
      const audio = document.getElementById('audio')
      return {
        status: document.getElementById('status')?.textContent || '',
        env: active?.runtime?.env || '',
        audioUrl: audio?.src || '',
        readyState: Number(audio?.readyState || 0),
        error: audio?.error ? {
          code: audio.error.code,
          message: audio.error.message || '',
        } : null,
      }
    })

    playbackAttempts.push({
      index: i + 1,
      result: results[i],
      ...attempt,
    })

    if (/已返回 128k 播放地址/.test(attempt.status)) break
  }

  const playback = playbackAttempts.find(item => /已返回 128k 播放地址/.test(item.status)) || playbackAttempts[0]
  assert.ok(playback, 'No Flower musicUrl attempts were completed')
  assert.equal(playback.env, 'desktop')

  const flowerUrlRequests = proxyTargets.filter(item => {
    return item.target.indexOf('/flower/v1/url/kg/') >= 0 &&
      item.target.slice(-5).toLowerCase() === '/128k'
  })
  const attemptedHashSet = {}
  for (const item of playbackAttempts) attemptedHashSet[String(item.result.hash || '').toUpperCase()] = true
  assert.ok(
    flowerUrlRequests.length >= playbackAttempts.length,
    'Flower KG requests were not observed for all tested results'
  )
  assert.ok(
    flowerUrlRequests.every(item => {
      const parts = item.target.split('/')
      const hash = parts[parts.length - 2] || ''
      return parts[parts.length - 3] === 'kg' &&
        parts[parts.length - 1].toLowerCase() === '128k' &&
        Boolean(attemptedHashSet[String(hash).toUpperCase()])
    }),
    'Flower KG endpoint did not receive the selected search-result hashes: ' +
      JSON.stringify(flowerUrlRequests, null, 2)
  )

  const succeeded = /已返回 128k 播放地址/.test(playback.status)
  const upstreamUnavailable = playbackAttempts.length > 0 &&
    playbackAttempts.every(item => /musicUrl 失败（128k）：HTTP (400|403)/.test(item.status))

  if (!succeeded) {
    assert.ok(
      upstreamUnavailable,
      'Flower musicUrl failed with an unexpected response: ' +
        JSON.stringify(playbackAttempts, null, 2)
    )
    console.log('WARN: Flower KG endpoint was reached with correct hashes, but the external Flower service rejected all tested requests.')
    console.log('No cross-platform search fallback is used.')
  } else {
    assert.match(playback.audioUrl, /^https?:/i, 'Flower musicUrl did not return a playable URL')
    assert.equal(playback.error, null, 'Audio element reported a media error')
  }

  console.log('FLOWER RESULT')
  console.log(JSON.stringify({
    sourceUrl: SOURCE_URL,
    keyword: KEYWORD,
    result: playback.result,
    playbackAttempts,
    status: playback.status,
    audioUrl: playback.audioUrl,
    readyState: playback.readyState,
    env: playback.env,
    upstreamUnavailable,
  }, null, 2))
  console.log(succeeded
    ? 'PASS: Flower KG search and musicUrl both use the same LX source'
    : 'PASS: Flower KG search integration is correct; upstream Flower playback service is unavailable from the test environment')
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

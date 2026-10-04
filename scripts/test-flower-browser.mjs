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
    results.every(item => item.source === 'kg'),
    'KG search returned results not bound to the KG source: ' + JSON.stringify(results)
  )
  console.log('PASS: KG search results remain bound to the selected source')
  console.log('First KG result:', JSON.stringify(results[0]))

  await page.locator('#search-results .search-row').first()
    .getByRole('button', { name: '解析并播放' })
    .click()

  await page.waitForFunction(
    () => {
      const status = document.getElementById('status')?.textContent || ''
      return /已返回 128k 播放地址|musicUrl 失败/.test(status)
    },
    null,
    { timeout: PLAYBACK_TIMEOUT_MS },
  )

  const playback = await page.evaluate(() => {
    const active = window.LXSourceManager.getActive()
    const audio = document.getElementById('audio')
    return {
      status: document.getElementById('status')?.textContent || '',
      env: active?.runtime?.env || '',
      currentSource: active?.sources ? Object.keys(active.sources) : [],
      audioUrl: audio?.src || '',
      readyState: Number(audio?.readyState || 0),
      error: audio?.error ? {
        code: audio.error.code,
        message: audio.error.message || '',
      } : null,
    }
  })

  assert.equal(playback.env, 'desktop')
  assert.match(
    playback.status,
    /已返回 128k 播放地址/,
    'Flower musicUrl request failed: ' + playback.status
  )
  assert.match(playback.audioUrl, /^https?:/i, 'Flower musicUrl did not return a playable URL')
  assert.equal(playback.error, null, 'Audio element reported a media error')

  console.log('FLOWER RESULT')
  console.log(JSON.stringify({
    sourceUrl: SOURCE_URL,
    keyword: KEYWORD,
    result: results[0],
    status: playback.status,
    audioUrl: playback.audioUrl,
    readyState: playback.readyState,
    env: playback.env,
  }, null, 2))
  console.log('PASS: Flower KG search and musicUrl both use the same LX source')
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

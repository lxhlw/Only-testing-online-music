import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const SOURCE_URL = process.env.LX_SOURCE_URL || 'https://raw.githubusercontent.com/pdone/lx-music-source/main/sixyin/latest.js'
const KEYWORD = '成都'
const VERSION = process.env.LX_SOURCE_NAME || 'unknown'
const INIT_TIMEOUT = Number(process.env.SIXYIN_INIT_TIMEOUT_MS || 30000)

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors = []
const failedResponses = []

page.on('pageerror', error => pageErrors.push(String(error)))
page.on('requestfailed', request => console.log('REQUEST FAILED:', request.method(), request.url(), request.failure()?.errorText || 'unknown'))
page.on('response', response => {
  if (response.status() >= 400) failedResponses.push(
    response.status() + ' ' + response.request().method() + ' ' + response.url()
  )
})

try {
  console.log('LX source:', VERSION)
  console.log('Source URL:', SOURCE_URL)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  assert.equal(await page.locator('#install-btn').isVisible(), true, 'App did not load')

  await page.locator('#source-url').fill(SOURCE_URL)
  await page.locator('#install-btn').click()

  await page.waitForFunction(
    () => {
      const manager = window.LXSourceManager
      const items = manager && manager.getSources ? manager.getSources() : []
      return Boolean(items.length && items[0].inited && items[0].runtime && items[0].sources)
    },
    null,
    { timeout: INIT_TIMEOUT }
  )

  const sourceState = await page.evaluate(() => {
    const items = window.LXSourceManager.getSources()
    const active = window.LXSourceManager.getActive()
    return {
      count: items.length,
      activeName: active && active.name,
      inited: Boolean(active && active.inited),
      sources: active && active.sources ? Object.keys(active.sources) : [],
      error: active && active.error
    }
  })

  assert.equal(sourceState.inited, true, 'SixYin did not finish initialization')
  assert.ok(sourceState.sources.length > 0, 'SixYin initialized without source entries')

  console.log('PASS: original SixYin initialized in real Chromium')
  console.log('Source:', sourceState.activeName)
  console.log('Supported sources:', sourceState.sources.join(', '))

  await page.locator('#search-input').fill(KEYWORD)
  await page.locator('#search-btn').click()

  await page.waitForFunction(
    () => document.querySelectorAll('#search-results .search-row').length > 0,
    null,
    { timeout: 60000 }
  )

  const searchState = await page.evaluate(() => ({
    keyword: document.getElementById('search-input').value,
    count: document.querySelectorAll('#search-results .search-row').length,
    firstTitle: (document.querySelector('#search-results .search-row b') || {}).textContent || ''
  }))

  assert.equal(searchState.keyword, KEYWORD)
  assert.ok(searchState.count > 0, 'Search returned no songs')

  console.log('PASS: browser search for 成都')
  console.log('Search results:', searchState.count)
  console.log('First result:', searchState.firstTitle)

  await page.locator('#search-results .search-row').first().getByRole(
    'button',
    { name: 'LX musicUrl 测试' }
  ).click()

  await page.waitForFunction(
    () => {
      const audio = document.getElementById('audio')
      return Boolean(audio && /^https?:/i.test(audio.src))
    },
    null,
    { timeout: 120000 }
  )

  const playbackState = await page.evaluate(() => {
    const audio = document.getElementById('audio')
    return {
      tagName: audio && audio.tagName,
      src: audio && audio.src,
      readyState: audio && audio.readyState,
      status: document.getElementById('status').textContent || ''
    }
  })

  assert.equal(playbackState.tagName, 'AUDIO')
  assert.match(playbackState.src, /^https?:/i)
  assert.match(playbackState.status, /musicUrl 已返回播放地址/)

  console.log('PASS: original SixYin musicUrl returned an HTTP(S) URL')
  console.log('Audio src:', playbackState.src)
  console.log('Audio readyState:', playbackState.readyState)
  console.log('PASS: HTML5 Audio received the SixYin playback URL')
} catch (error) {
  console.error('SIXYIN BROWSER TEST FAILED')
  console.error(error && error.stack ? error.stack : error)
  console.error(
    'Page status:',
    await page.locator('#status').textContent().catch(() => 'unavailable')
  )
  console.error('LX request trace:', JSON.stringify(await page.evaluate(() => {
    const active = window.LXSourceManager && window.LXSourceManager.getActive
      ? window.LXSourceManager.getActive() : null
    return active && active.runtime && active.runtime.__debugRequests
      ? active.runtime.__debugRequests : []
  }).catch(() => []), null, 2))
  console.error('Page errors:', pageErrors.join('\n') || 'none')
  console.error('Failed responses:', failedResponses.join('\n') || 'none')
  process.exitCode = 1
} finally {
  await browser.close()
}

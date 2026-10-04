import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const SOURCE_URL = 'https://raw.githubusercontent.com/pdone/lx-music-source/main/huibq/latest.js'
const CHANNELS = ['kw', 'kg', 'tx', 'wy', 'mg']
const KEYWORD = '成都'

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

async function waitForSearch() {
  await page.waitForFunction(
    () => document.querySelectorAll('#search-results .search-row').length > 0 ||
      /搜索失败/.test(document.getElementById('status')?.textContent || ''),
    null,
    { timeout: 60000 }
  )
}

async function waitForPlaybackStatus() {
  await page.waitForFunction(
    () => /musicUrl (已返回播放地址|失败|返回了无效结果)/.test(
      document.getElementById('status')?.textContent || ''
    ),
    null,
    { timeout: 30000 }
  )
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('#source-url').fill(SOURCE_URL)
  await page.locator('#install-btn').click()

  await page.waitForFunction(() => {
    const active = window.LXSourceManager?.getActive?.()
    return Boolean(active && active.inited && active.sources)
  }, null, { timeout: 30000 })

  const declared = await page.evaluate(() => Object.keys(
    window.LXSourceManager.getActive().sources || {}
  ))
  assert.deepEqual(declared, CHANNELS)

  const results = []

  for (const channel of CHANNELS) {
    const result = {
      channel,
      search: 'FAIL',
      musicUrl: 'FAIL',
      playback: 'FAIL',
      status: '',
      title: '',
      singer: '',
      currentTime: 0,
    }

    try {
      await page.locator('#channel-list .channel-button[title="' + channel + '"]').click()
      await page.locator('#search-input').fill(KEYWORD)
      await page.locator('#search-btn').click()

      await waitForSearch()
      const rows = await page.locator('#search-results .search-row').count()
      const searchStatus = await page.locator('#status').textContent()
      if (rows === 0) {
        result.status = searchStatus
        results.push(result)
        continue
      }

      result.search = 'PASS'
      result.title = await page.locator('#search-results .search-row').first().locator('b').textContent()
      result.singer = await page.locator('#search-results .search-row').first().locator('span').textContent()

      await page.locator('#search-results .search-row').first().locator('button').click()
      await waitForPlaybackStatus()

      result.status = await page.locator('#status').textContent()
      if (/musicUrl (已返回播放地址)/.test(result.status)) result.musicUrl = 'PASS'

      result.currentTime = await page.locator('#audio').evaluate(audio => Number(audio.currentTime || 0))
      if (result.musicUrl === 'PASS' && result.currentTime >= 0.5) result.playback = 'PASS'
    } catch (error) {
      result.status = result.status || String(error)
    }

    results.push(result)
    await page.locator('#audio').evaluate(audio => {
      try { audio.pause() } catch {}
      try { audio.removeAttribute('src') } catch {}
      try { audio.load() } catch {}
    })
  }

  console.log('Channel playback matrix:')
  console.log(JSON.stringify(results, null, 2))

  const searchesPassed = results.filter(item => item.search === 'PASS').length
  const urlsPassed = results.filter(item => item.musicUrl === 'PASS').length
  const playbackPassed = results.filter(item => item.playback === 'PASS').length

  assert.equal(searchesPassed, CHANNELS.length, 'Not every declared channel could search 成都')
  assert.ok(urlsPassed > 0, 'No declared channel returned a musicUrl')
  assert.ok(playbackPassed > 0, 'No declared channel reached actual HTML5 playback')

  console.log('PASS: every declared channel supports search')
  console.log('PASS: at least one declared channel returned musicUrl')
  console.log('PASS: at least one declared channel reached actual HTML5 playback')
} catch (error) {
  console.error('CHANNEL PLAYBACK MATRIX TEST FAILED')
  console.error(error?.stack || String(error))
  process.exitCode = 1
} finally {
  await browser.close()
}

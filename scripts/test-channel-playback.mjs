import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const SOURCE_URL = 'https://raw.githubusercontent.com/pdone/lx-music-source/main/huibq/latest.js'
const CHANNEL = String(process.env.TEST_CHANNEL || 'tx').toLowerCase()
const KEYWORD = '成都'
const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 20000)
const URL_TIMEOUT_MS = Number(process.env.URL_TIMEOUT_MS || 20000)
const PLAYBACK_TIMEOUT_MS = Number(process.env.PLAYBACK_TIMEOUT_MS || 12000)

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

function waitForSearch() {
  return page.waitForFunction(
    () => document.querySelectorAll('#search-results .search-row').length > 0 || /搜索失败/.test(document.getElementById('status')?.textContent || ''),
    null,
    { timeout: SEARCH_TIMEOUT_MS }
  )
}

function waitForMusicUrlStatus() {
  return page.waitForFunction(
    () => /musicUrl (已返回播放地址|失败|返回了无效结果)/.test(document.getElementById('status')?.textContent || ''),
    null,
    { timeout: URL_TIMEOUT_MS }
  )
}

try {
  assert.match(CHANNEL, /^(kw|kg|tx|wy|mg)$/, 'Unsupported test channel: ' + CHANNEL)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('#source-url').fill(SOURCE_URL)
  await page.locator('#install-btn').click()
  await page.waitForFunction(() => {
    const active = window.LXSourceManager && window.LXSourceManager.getActive ? window.LXSourceManager.getActive() : null
    return Boolean(active && active.inited && active.sources)
  }, null, { timeout: 30000 })

  const declared = await page.evaluate(() => Object.keys(window.LXSourceManager.getActive().sources || {}))
  assert.ok(declared.includes(CHANNEL), 'Channel not declared by source: ' + CHANNEL)
  await page.locator('#channel-list .channel-button').evaluateAll((buttons, channel) => {
    const target = buttons.find(button => String(button.title || '').toLowerCase() === String(channel).toLowerCase())
    if (!target) throw new Error('Channel button not found: ' + channel)
    target.click()
  }, CHANNEL)
  await page.locator('#search-input').fill(KEYWORD)
  await page.locator('#search-btn').click()

  const result = { channel: CHANNEL, searchRows: 0, search: 'FAIL', musicUrl: 'SKIP', playback: 'SKIP', searchStatus: '' }
  try {
    await waitForSearch()
    result.searchRows = await page.locator('#search-results .search-row').count()
    result.searchStatus = await page.locator('#status').textContent()
  } catch (error) {
    result.searchStatus = String(error)
  }

  if (result.searchRows > 0) {
    result.search = 'PASS'
    const row = page.locator('#search-results .search-row').first()
    result.title = await row.locator('b').textContent()
    result.singer = await row.locator('span').textContent()
    const playButton = row.getByRole('button', { name: '解析并播放' })
    assert.equal(await playButton.count(), 1, 'Search result must expose exactly one playback button')
    await playButton.click()
    try {
      await waitForMusicUrlStatus()
      result.musicUrlStatus = await page.locator('#status').textContent()
      result.musicUrl = /musicUrl 已返回播放地址/.test(result.musicUrlStatus) ? 'PASS' : 'FAIL'
    } catch (error) {
      result.musicUrl = 'TIMEOUT'
      result.musicUrlStatus = String(error)
    }
    if (result.musicUrl === 'PASS') {
      try {
        await page.waitForFunction(() => {
          const audio = document.getElementById('audio')
          return Boolean(audio && audio.currentTime >= 0.5 && !audio.error)
        }, null, { timeout: PLAYBACK_TIMEOUT_MS })
        result.playback = 'PASS'
        result.currentTime = await page.locator('#audio').evaluate(audio => Number(audio.currentTime || 0))
      } catch (error) {
        result.playback = 'FAIL'
        result.playbackError = String(error)
        result.currentTime = await page.locator('#audio').evaluate(audio => Number(audio.currentTime || 0)).catch(() => 0)
      }
    }
  }

  console.log('CHANNEL RESULT')
  console.log(JSON.stringify(result, null, 2))
  console.log('PASS: channel diagnostic completed for ' + CHANNEL)
} catch (error) {
  console.error('CHANNEL TEST INFRASTRUCTURE FAILED')
  console.error(error?.stack || String(error))
  process.exitCode = 1
} finally {
  await browser.close()
}
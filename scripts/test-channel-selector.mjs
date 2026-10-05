import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const SOURCE_URL = 'https://raw.githubusercontent.com/pdone/lx-music-source/main/huibq/latest.js'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('#source-url').fill(SOURCE_URL)
  await page.locator('#install-btn').click()

  await page.waitForFunction(() => {
    const active = window.LXSourceManager && window.LXSourceManager.getActive
      ? window.LXSourceManager.getActive()
      : null
    return Boolean(active && active.inited && active.sources)
  }, null, { timeout: 30000 })

  const state = await page.evaluate(() => {
    const active = window.LXSourceManager.getActive()
    const channels = Array.from(document.querySelectorAll('#channel-list .channel-button'))
      .map(button => ({ name: button.textContent.trim(), active: button.classList.contains('active'), key: button.title }))
    const qualitySummary = document.querySelector('#quality-summary')?.textContent.trim() || ''
    return {
      source: active && active.name,
      declaredChannels: active && active.sources ? Object.keys(active.sources) : [],
      channels,
      qualitySummary,
      selectedChannel: window.document.querySelector('#channel-list .channel-button.active')?.title || '',
    }
  })

  const expected = ['kw', 'kg', 'tx', 'wy', 'mg']
  assert.deepEqual(state.declaredChannels, expected)
  assert.equal(state.channels.length, expected.length)
  assert.equal(state.channels.filter(item => item.active).length, 1)
  assert.equal(state.selectedChannel.toLowerCase(), 'tx')
  assert.ok(state.qualitySummary.includes('320k'))
  assert.ok(state.qualitySummary.includes('128k'))

  console.log('PASS: dynamic source channels rendered')
  console.log('Source:', state.source)
  console.log('Channels:', JSON.stringify(state.channels))
  console.log('Quality summary:', state.qualitySummary)
} catch (error) {
  console.error('CHANNEL SELECTOR TEST FAILED')
  console.error(error?.stack || String(error))
  process.exitCode = 1
} finally {
  await browser.close()
}

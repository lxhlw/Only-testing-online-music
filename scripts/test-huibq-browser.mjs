import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({\n  viewport: { width: 800, height: 1280 },\n  userAgent: 'Mozilla/5.0 (Linux; Android 4.4.2; L101 Build/L101_V1.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/49.0.2623.112 Mobile Safari/537.36 Via/5.3'\n})\nconst page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(String(error)))

try {
  await page.addInitScript(() => {
    try { localStorage.clear() } catch (e) {}
  })

  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('#verified-install-btn').click()

  await page.waitForFunction(() => {
    const list = document.getElementById('source-list')
    const text = list ? list.textContent : ''
    return text.indexOf('Huibq_lxmusic源') >= 0 &&
      text.indexOf('v1.2.0') >= 0 &&
      text.indexOf('READY') >= 0
  }, null, { timeout: 8000 })

  const unnamed = await page.locator('.source-name', { hasText: 'Unnamed LX Source' }).count()
  assert.equal(unnamed, 0, 'verified Huibq import must not create an unnamed source')

  const wyButton = page.locator('#channel-list button[title="WY"]')
  await wyButton.waitFor({ state: 'visible', timeout: 5000 })
  await wyButton.click()
  await page.fill('#search-input', '成都')
  await page.locator('#search-btn').click()

  await page.waitForFunction(() => {
    const results = document.getElementById('search-results')
    const status = document.getElementById('status')
    return (results && results.children.length > 0) ||
      Boolean(status && status.textContent.indexOf('搜索完成') >= 0)
  }, null, { timeout: 15000 })

  assert.ok(await page.locator('#search-results .search-row').count() > 0, 'WY 成都 search should return usable songs')\n  const statusText = await page.locator('#status').textContent()\n  assert.ok(statusText && statusText.indexOf('正在按') < 0, 'WY search must not remain stuck in searching state')
  assert.equal(errors.length, 0, 'browser page errors: ' + errors.join(' | '))

  console.log('PASS: verified Huibq import has correct metadata and WY search 成都 returns results')
} finally {
  await context.close()\n  await browser.close()
}

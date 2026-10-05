import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 800, height: 1280 } })
const errors = []

page.on('pageerror', error => errors.push(String(error)))

try {
  // Keep window.load pending after DOMContentLoaded so this test catches
  // handlers that are bound too late for slow legacy browsers.
  await page.route('**/styles.css', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500))
    await route.continue()
  })

  await page.goto(baseUrl + '/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })

  assert.notEqual(await page.evaluate(() => document.readyState), 'complete')
  await page.locator('#install-btn').waitFor({ state: 'visible', timeout: 5000 })
  await page.fill('#source-url', 'not-a-valid-source-url')
  await page.locator('#install-btn').click()

  await page.waitForFunction(() => {
    const status = document.getElementById('status')
    return Boolean(status && status.textContent.indexOf('请输入 HTTP / HTTPS') >= 0)
  }, null, { timeout: 3000 })

  assert.equal(errors.length, 0, 'import UI produced page errors: ' + errors.join(' | '))
  console.log('PASS: import button responds before window.load')
} finally {
  await browser.close()
}

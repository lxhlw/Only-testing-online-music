import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 800, height: 1280 } })
const errors = []

page.on('pageerror', error => errors.push(String(error)))

try {
  await page.goto(baseUrl + '/legacy-test.html', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })

  await page.waitForFunction(() => {
    const summary = document.getElementById('summary')
    const checks = document.getElementById('checks')
    return Boolean(summary && checks && checks.children.length > 0)
  }, null, { timeout: 10000 })

  assert.equal(await page.locator('h1').textContent(), 'Android 4.4 / Via 浏览器自检')
  assert.ok(await page.locator('#checks .row').count() >= 10)
  assert.equal(errors.length, 0, 'legacy-test.html produced page errors: ' + errors.join(' | '))

  console.log('PASS: legacy-test.html loads and renders in Chromium')
  console.log('Checks rendered:', await page.locator('#checks .row').count())
} finally {
  await browser.close()
}

import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'

async function testViewport(browser, viewport, label) {
  const context = await browser.newContext({
    viewport,
    userAgent: viewport.width <= 680
      ? 'Mozilla/5.0 (Linux; Android 4.4.2; L101 Build/L101_V1.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/49.0.2623.112 Mobile Safari/537.36 Via/5.3'
      : 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/49.0.2623.112 Safari/537.36'
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  try {
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.locator('.nav-item[data-view="playlist"]').click()
    await page.waitForTimeout(500)
    const state = await page.evaluate(() => {
      const panel = document.getElementById('view-playlist')
      const main = document.querySelector('.main-stage')
      const nav = document.querySelector('.nav-rail')
      return {
        panelActive: Boolean(panel && /(^|\\s)active(\\s|$)/.test(panel.className)),
        navBottom: nav ? nav.getBoundingClientRect().bottom : 0,
        mainTop: main ? main.getBoundingClientRect().top : 0,
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }
    })
    assert.equal(state.panelActive, true, `${label}: playlist view must stay active after navigation`)
    assert.ok(state.scrollWidth <= state.viewportWidth + 2, `${label}: page must not overflow horizontally`)
    if (viewport.width <= 680) {
      assert.ok(state.mainTop >= state.navBottom - 2, `${label}: mobile main content must be below the top navigation`)
    } else {
      assert.ok(state.mainTop <= 5, `${label}: tablet/desktop main stage must stay beside the navigation`)
    }
    await page.locator('.nav-item[data-view="search"]').click()
    await page.locator('.nav-item[data-view="playlist"]').click()
    await page.waitForTimeout(250)
    assert.equal(await page.locator('#view-playlist').evaluate(el => /(^|\\s)active(\\s|$)/.test(el.className)), true, `${label}: repeated playlist navigation must remain stable`)
    assert.equal(errors.length, 0, `${label}: browser page errors: ${errors.join(' | ')}`)
    console.log(`PASS: responsive ${label}`)
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch({ headless: true })
try {
  await testViewport(browser, { width: 390, height: 844 }, 'phone 390x844')
  await testViewport(browser, { width: 800, height: 1280 }, 'tablet 800x1280')
  await testViewport(browser, { width: 1280, height: 900 }, 'desktop 1280x900')
} finally {
  await browser.close()
}
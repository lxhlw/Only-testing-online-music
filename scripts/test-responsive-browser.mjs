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
      const activeNav = document.querySelector('.nav-item.active')
      function hasActiveClass(node) {
        return Boolean(node && String(node.className || '').split(/\s+/).indexOf('active') >= 0)
      }
      return {
        panelActive: hasActiveClass(panel),
        activeNav: activeNav ? activeNav.getAttribute('data-view') : '',
        hash: location.hash,
        navBottom: nav ? nav.getBoundingClientRect().bottom : 0,
        mainTop: main ? main.getBoundingClientRect().top : 0,
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }
    })
    assert.equal(state.panelActive, true, label + ': playlist view must stay active after navigation')
    assert.equal(state.activeNav, 'playlist', label + ': playlist navigation item must remain active')
    assert.equal(state.hash, '#playlist', label + ': playlist navigation must persist in the URL hash')
    assert.ok(state.scrollWidth <= state.viewportWidth + 2, label + ': page must not overflow horizontally')
    if (viewport.width <= 680) {
      assert.ok(state.mainTop >= state.navBottom - 2, label + ': mobile main content must be below the top navigation')
    } else {
      assert.ok(state.mainTop >= 45 && state.mainTop <= 70, label + ': tablet/desktop main content must begin below the top bar')
    }

    await page.locator('.nav-item[data-view="search"]').click()
    await page.waitForTimeout(150)
    assert.equal(await page.locator('#view-search').evaluate(el => String(el.className || '').split(/\s+/).indexOf('active') >= 0), true, label + ': search navigation must switch views')
    await page.locator('.nav-item[data-view="playlist"]').click()
    await page.waitForTimeout(250)
    assert.equal(await page.locator('#view-playlist').evaluate(el => String(el.className || '').split(/\s+/).indexOf('active') >= 0), true, label + ': repeated playlist navigation must remain stable')
    assert.equal(await page.evaluate(() => location.hash), '#playlist', label + ': repeated playlist navigation must keep playlist state')
    assert.equal(errors.length, 0, label + ': browser page errors: ' + errors.join(' | '))
    console.log('PASS: responsive ' + label)  } finally {
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
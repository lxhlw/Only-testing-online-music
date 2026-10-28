import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'

async function testViewport(browser, viewport, label) {
  const context = await browser.newContext({
    viewport,
    ...(viewport.width <= 680 ? { isMobile: true, hasTouch: true } : {})
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  try {
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    const navigate=async view=>{
      if(viewport.width<=740){
        await page.waitForFunction(()=>document.documentElement.classList.contains('mobile-shell-ready'))
        await page.locator('.mobile-menu-button').click()
        assert.equal(await page.locator('.mobile-menu-shade').isVisible(),true,
          label+': drawer opens on phone')
      }
      await page.locator('.nav-item[data-view="'+view+'"]').click()
      if(viewport.width<=740)
        assert.equal(await page.locator('.mobile-menu-shade').isVisible(),false,
          label+': drawer closes after selection')
    }
    await navigate('playlist')
    await page.waitForTimeout(500)
    const state = await page.evaluate(() => {
      const panel = document.getElementById('view-playlist')
      const main = document.querySelector('.main-stage')
      const nav = document.querySelector('.nav-rail')
      const topbar = document.querySelector('.topbar')
      const activeNav = document.querySelector('.nav-item.active')
      function hasActiveClass(node) {
        return Boolean(node && String(node.className || '').split(/\s+/).indexOf('active') >= 0)
      }
      return {
        panelActive: hasActiveClass(panel),
        activeNav: activeNav ? activeNav.getAttribute('data-view') : '',
        hash: location.hash,
        navBottom: nav ? nav.getBoundingClientRect().bottom : 0,
        topbarBottom: topbar ? topbar.getBoundingClientRect().bottom : 0,
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
      assert.ok(state.mainTop >= state.topbarBottom - 2 && state.mainTop <= state.topbarBottom + 10,
        label + ': mobile main content starts below the single compact header, not below an always-visible tab bar')
    } else {
      assert.ok(
        state.mainTop >= state.topbarBottom - 2 && state.mainTop <= state.topbarBottom + 16,
        label + ': tablet/desktop main content must begin immediately below the top bar; topbarBottom=' + state.topbarBottom + ', mainTop=' + state.mainTop
      )
    }

    await navigate('search')
    await page.waitForTimeout(150)
    assert.equal(await page.locator('#view-search').evaluate(el => String(el.className || '').split(/\s+/).indexOf('active') >= 0), true, label + ': search navigation must switch views')
    await navigate('playlist')
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
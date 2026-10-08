import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const browser = await chromium.launch({ headless: true })
const cases = [
  { width: 390, height: 844, name: 'phone 390px' },
  { width: 800, height: 1280, name: 'legacy tablet 800px' },
  { width: 1789, height: 856, name: 'desktop 1789px' }
]
const sourceNames = ['Huibq_lxmusic源', '六音音源']
const SOURCE_STORAGE_KEY = 'only-testing-online-music.lx-sources'
const ACTIVE_STORAGE_KEY = 'only-testing-online-music.active-source-id'

function checkName(selection, name, label) {
  assert.equal(selection.summary, name, label + ': prominent summary must show the selected source')
  assert.equal(selection.currentCardName, name, label + ': active card must show selected source')
  assert.equal(selection.currentCardCount, 1, label + ': exactly one source card should be highlighted')
  assert.equal(selection.badgeCount, 1, label + ': exactly one current badge should be visible')
  assert.equal(selection.currentButtonDisabled, true, label + ': selected button must not be clickable again')
  assert.match(selection.currentButtonText, /当前使用中/, label + ': selected button must have explicit label')
  assert.match(selection.topText, new RegExp('^当前音源：' + name + '$'), label + ': top bar must identify active source')
  assert.ok(selection.summaryHighlighted, label + ': current source summary needs highlight')
  assert.ok(selection.cardHighlighted, label + ': current source card needs highlight')
  assert.equal(selection.topInViewport, true, label + ': header active-source chip must fit screen')
}

async function state(page) {
  return await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#source-list .source-item'))
    const active = cards.filter(el => el.classList.contains('is-active-source'))
    const top = document.getElementById('top-source-label')
    const summary = document.getElementById('active-source-summary')
    const bounds = top.getBoundingClientRect()
    return {
      currentCardCount: active.length,
      currentCardName: active[0]?.querySelector('.source-name')?.textContent || '',
      badgeCount: document.querySelectorAll('.source-current-badge').length,
      currentButtonText: active[0]?.querySelector('.source-activate-button')?.textContent || '',
      currentButtonDisabled: active[0]?.querySelector('.source-activate-button')?.disabled || false,
      topText: top.textContent.trim(),
      topInViewport: bounds.left >= -2 && bounds.right <= document.documentElement.clientWidth + 2,
      summary: summary.querySelector('.active-source-summary-name')?.textContent || '',
      summaryHighlighted: summary.classList.contains('is-selected'),
      cardHighlighted: Boolean(active[0] && getComputedStyle(active[0]).borderLeftWidth === '5px'),
      stored: localStorage.getItem('only-testing-online-music.active-source-id'),
      listCount: cards.length
    }
  })
}

try {
  for (const size of cases) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      userAgent: size.width <= 800
        ? 'Mozilla/5.0 (Linux; Android 4.4.2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.112 Mobile Safari/537.36'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'
    })
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    try {
      await page.addInitScript(({ SOURCE_STORAGE_KEY, ACTIVE_STORAGE_KEY }) => {
        if (sessionStorage.getItem('active-source-fixture-loaded')) return
        localStorage.clear()
        const code = 'window.lx.send(window.lx.EVENT_NAMES.inited, {status: true, sources: {tx: {name: "QQ音乐", actions: ["musicUrl"], qualitys: ["128k"]}}});'
        localStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify([
          { id: 'fixture-huibq', name: 'Huibq_lxmusic源', url: 'https://fixture.example/one.js', version: 'v1.2.0', code },
          { id: 'fixture-sixyin', name: '六音音源', url: 'https://fixture.example/two.js', version: 'v1.2.1', code }
        ]))
        localStorage.setItem(ACTIVE_STORAGE_KEY, 'fixture-huibq')
        sessionStorage.setItem('active-source-fixture-loaded', '1')
      }, { SOURCE_STORAGE_KEY, ACTIVE_STORAGE_KEY })

      await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.locator('.nav-item[data-view="settings"]').click()
      await page.waitForFunction(() =>
        document.querySelectorAll('#source-list .source-item').length === 2 &&
        document.querySelectorAll('#source-list .source-current-badge').length === 1,
      null, { timeout: 10000 })
      let selected = await state(page)
      checkName(selected, sourceNames[0], size.name + ': initial')
      assert.equal(selected.stored, 'fixture-huibq')
      assert.equal(selected.listCount, 2)

      const switchButton = page.locator('#source-list .source-item').nth(1).locator('.source-activate-button')
      assert.equal(await switchButton.isEnabled(), true)
      await switchButton.click()
      await page.waitForFunction(() => localStorage.getItem('only-testing-online-music.active-source-id') === 'fixture-sixyin')
      selected = await state(page)
      checkName(selected, sourceNames[1], size.name + ': switched')
      assert.equal(selected.stored, 'fixture-sixyin')
      console.log('PASS: ' + size.name + ' active source is obvious and switch immediately updates all labels')

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator('.nav-item[data-view="settings"]').click()
      await page.waitForFunction(() => document.querySelectorAll('#source-list .source-current-badge').length === 1)
      selected = await state(page)
      checkName(selected, sourceNames[1], size.name + ': refreshed')
      assert.equal(selected.stored, 'fixture-sixyin')
      console.log('PASS: ' + size.name + ' selected source UI persists across page refresh')

      await page.locator('#source-list .source-item.is-active-source .source-buttons .secondary').click()
      await page.waitForFunction(() => localStorage.getItem('only-testing-online-music.active-source-id') === 'fixture-huibq')
      selected = await state(page)
      checkName(selected, sourceNames[0], size.name + ': deleted current and fell back')
      assert.equal(selected.listCount, 1)

      await page.locator('#clear-btn').click()
      await page.waitForFunction(() => document.querySelectorAll('#source-list .source-item').length === 0)
      selected = await state(page)
      assert.equal(selected.badgeCount, 0)
      assert.equal(selected.currentCardCount, 0)
      assert.equal(selected.summary, '尚未选择音源')
      assert.equal(selected.summaryHighlighted, false)
      assert.equal(selected.topText, '当前音源：未选择')
      assert.equal(selected.stored, null)
      assert.deepEqual(pageErrors, [], size.name + ': no uncaught errors')
      console.log('PASS: ' + size.name + ' deletion, fallback, and clear indicators')
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}

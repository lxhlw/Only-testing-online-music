import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Reproduce the exact five-child DOM contract created by renderSearchResults()
// without relying on third-party search/music APIs.
const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const browser = await chromium.launch({ headless: true })
const sizes = [
  { width: 390, height: 844, name: 'phone 390' },
  { width: 680, height: 800, name: 'phone breakpoint 680' },
  { width: 681, height: 850, name: 'tablet breakpoint 681' },
  { width: 800, height: 1280, name: 'legacy tablet 800' },
  { width: 900, height: 850, name: 'tablet 900' },
  { width: 1280, height: 900, name: 'desktop 1280' },
  { width: 1789, height: 856, name: 'reported desktop 1789' },
  { width: 1920, height: 1080, name: 'desktop 1920' }
]

try {
  for (const size of sizes) {
    const page = await browser.newPage({
      viewport: { width: size.width, height: size.height },
      userAgent: 'Mozilla/5.0 (Linux; Android 4.4.2; L101 Build/L101_V1.0) AppleWebKit/537.36 Chrome/49.0.2623.112 Safari/537.36'
    })
    const errors = []
    page.on('pageerror', error => errors.push(String(error)))
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.evaluate(() => {
        const list = document.getElementById('search-results')
        if (!list) throw new Error('Missing #search-results')
        list.innerHTML = ''
        for (let i = 0; i < 20; i++) {
          const row = document.createElement('div')
          row.className = 'search-row'
          row.innerHTML = '<b>成都 (Live) 特别演出版本 ' + i +
            '</b><span>赵雷 / 很长的歌手名称测试</span>' +
            '<small class="search-source">QQ音乐</small>'
          const actions = document.createElement('div')
          actions.className = 'search-actions'
          for (const label of ['解析并播放', '加入队列', '收藏']) {
            const button = document.createElement('button')
            button.type = 'button'
            button.textContent = label
            actions.appendChild(button)
          }
          row.appendChild(actions)
          list.appendChild(row)
        }
      })
      const measurements = await page.evaluate(() => {
        const list = document.getElementById('search-results')
        const rows = Array.from(list.querySelectorAll(':scope > .search-row'))
        const viewportWidth = document.documentElement.clientWidth
        const failures = []
        const slack = 2
        for (const [index, row] of rows.entries()) {
          const rowRect = row.getBoundingClientRect()
          const title = row.querySelector('b')
          const singer = row.querySelector('span')
          const source = row.querySelector('small.search-source')
          const actions = row.querySelector('.search-actions')
          const actionRect = actions.getBoundingClientRect()
          const sourceRect = source.getBoundingClientRect()
          const titleRect = title.getBoundingClientRect()
          const singerRect = singer.getBoundingClientRect()
          const buttons = Array.from(actions.querySelectorAll('button'))
          if (buttons.length !== 3) failures.push(index + ': missing buttons')
          if (actionRect.left < rowRect.left - slack ||
              actionRect.right > rowRect.right + slack ||
              actionRect.left < -slack ||
              actionRect.right > viewportWidth + slack) {
            failures.push(index + ': actions out of bounds ' + JSON.stringify({
              rowLeft: rowRect.left, rowRight: rowRect.right,
              actionLeft: actionRect.left, actionRight: actionRect.right, viewportWidth
            }))
          }
          if (titleRect.left < rowRect.left - slack ||
              titleRect.right > rowRect.right + slack ||
              sourceRect.right > rowRect.right + slack) {
            failures.push(index + ': text/source out of bounds')
          }
          if (rowRect.bottom + slack < actionRect.bottom) {
            failures.push(index + ': actions overflow vertically')
          }
          if (getComputedStyle(singer).display !== 'none' &&
              singerRect.right > sourceRect.left + slack) {
            failures.push(index + ': singer overlaps source')
          }
          for (const button of buttons) {
            const bounds = button.getBoundingClientRect()
            if (bounds.left < -slack || bounds.right > viewportWidth + slack ||
                bounds.left < rowRect.left - slack || bounds.right > rowRect.right + slack) {
              failures.push(index + ': button offscreen ' + button.textContent)
            }
          }
        }
        return {
          viewportWidth,
          pageScrollWidth: document.documentElement.scrollWidth,
          rowCount: rows.length,
          display: getComputedStyle(rows[0]).display,
          failures
        }
      })
      assert.equal(measurements.rowCount, 20, size.name + ': expected all result rows')
      assert.equal(measurements.display, 'flex', size.name + ': search rows must use legacy-compatible flex')
      assert.ok(measurements.pageScrollWidth <= measurements.viewportWidth + 2,
        size.name + ': horizontal page overflow: ' + JSON.stringify(measurements))
      assert.deepEqual(measurements.failures, [],
        size.name + ': search buttons and content must stay within each row')
      assert.deepEqual(errors, [], size.name + ': browser JS errors')
      console.log('PASS: search result actions remain visible at ' + size.name)
    } finally {
      await page.close()
    }
  }
} finally {
  await browser.close()
}

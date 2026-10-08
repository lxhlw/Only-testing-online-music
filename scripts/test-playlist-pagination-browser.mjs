import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 800, height: 1280 } })
const errors = []
let scenario = 'normal'
let failSecondPageOnce = false
const requestedOffsets = []

page.on('pageerror', err => errors.push(String(err)))
page.on('response', response => {
  if (response.url().includes('/api/netease-playlists?id=')) {
    requestedOffsets.push(new URL(response.url()).searchParams.get('offset'))
  }
})

const tracks = Array.from({ length: 51 }, (_, i) => ({
  id: String(i + 1),
  songId: String(i + 1),
  name: 'Track ' + (i + 1),
  singer: 'Test Artist',
  source: 'wy',
  interval: 180000
}))
const playlist = { id: 123, name: 'Fixture playlist', trackCount: 51, creator: 'Test fixture' }

await page.route('**/api/netease-playlists?*', async route => {
  const url = new URL(route.request().url())
  if (!url.searchParams.has('id')) {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ result: { playlistCount: 1, playlists: [playlist] } })
    })
    return
  }
  const offset = Number(url.searchParams.get('offset') || 0)
  if (scenario === 'detail-error' || (scenario === 'retry' && offset === 50 && failSecondPageOnce)) {
    failSecondPageOnce = false
    await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture upstream failure' }) })
    return
  }
  const total = scenario === 'empty' ? 0 : tracks.length
  const pageSongs = scenario === 'empty' ? [] : tracks.slice(offset, offset + 50)
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      playlist,
      songs: pageSongs,
      total,
      nextOffset: Math.min(total, offset + 50),
      hasMore: offset + 50 < total
    })
  })
})

async function openDetail() {
  await page.locator('.nav-item[data-view="playlist"]').click()
  await page.locator('#playlist-featured .playlist-card').first().waitFor()
  await page.locator('#playlist-featured .playlist-open-button').first().click()
}

try {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })

  await openDetail()
  await page.waitForFunction(() => document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length === 50)
  assert.equal(await page.locator('#playlist-detail-songs .playlist-song-row').count(), 50)
  assert.equal(await page.locator('#playlist-load-more-btn').isVisible(), true)
  await page.locator('#playlist-load-more-btn').click()
  await page.waitForFunction(() => document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length === 51)
  assert.equal(await page.locator('#playlist-load-more-btn').isVisible(), false)
  const titles = await page.locator('#playlist-detail-songs .playlist-song-row .song-main b').allTextContents()
  assert.equal(new Set(titles).size, 51)
  assert.equal(titles[50], 'Track 51')
  assert.deepEqual(requestedOffsets.slice(0, 2), ['0', '50'])
  console.log('PASS: first 50 songs, Load More, remaining one song, no duplicates')

  await page.locator('#playlist-back-btn').click()
  scenario = 'empty'
  await openDetail()
  await page.waitForFunction(() => /已加载 0 首/.test(document.querySelector('#playlist-detail-status')?.textContent || ''))
  assert.equal(await page.locator('#playlist-detail-songs .playlist-song-row').count(), 0)
  assert.equal(await page.locator('#playlist-load-more-btn').isVisible(), false)
  console.log('PASS: empty playlist is displayed explicitly')

  await page.locator('#playlist-back-btn').click()
  scenario = 'detail-error'
  await openDetail()
  await page.waitForFunction(() => /加载失败/.test(document.querySelector('#playlist-detail-status')?.textContent || ''))
  assert.equal(await page.locator('#playlist-detail-songs .playlist-song-row').count(), 0)
  console.log('PASS: first page API error surfaces failure state')

  await page.locator('#playlist-back-btn').click()
  scenario = 'retry'
  failSecondPageOnce = true
  await openDetail()
  await page.waitForFunction(() => document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length === 50)
  await page.locator('#playlist-load-more-btn').click()
  await page.waitForFunction(() => /加载失败/.test(document.querySelector('#playlist-detail-status')?.textContent || ''))
  assert.equal(await page.locator('#playlist-load-more-btn').isVisible(), true)
  await page.locator('#playlist-load-more-btn').click()
  await page.waitForFunction(() => document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length === 51)
  assert.equal(await page.locator('#playlist-load-more-btn').isVisible(), false)
  console.log('PASS: second page can retry after upstream failure')

  assert.deepEqual(errors, [], 'No uncaught browser page errors expected')
  console.log('PASS: deterministic playlist pagination browser suite')
} finally {
  await browser.close()
}

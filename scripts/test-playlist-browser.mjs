import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const KEYWORD = process.env.TEST_PLAYLIST_KEYWORD || String.fromCharCode(229,169,176,35199)

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors = []
page.on('pageerror', error => pageErrors.push(String(error)))

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.nav-item[data-view="playlist"]').click()
  await page.locator('#global-search-input').fill(KEYWORD)
  await page.locator('#global-search-btn').click()

  await page.waitForFunction(() => {
    return document.querySelectorAll('#playlist-featured .playlist-card').length > 0 ||
      /歌单搜索失败|没有找到歌单/.test(document.body.innerText || '')
  }, null, { timeout: 30000 })

  const cards = page.locator('#playlist-featured .playlist-card')
  assert.ok(await cards.count() > 0, 'Playlist search returned no playlist cards')

  const firstCardName = (await cards.first().locator('.playlist-name').textContent() || '').trim()
  assert.ok(firstCardName, 'Playlist card has no name')
  await cards.first().locator('.playlist-open-button').click()

  await page.waitForFunction(() => {
    const panel = document.getElementById('playlist-detail-panel')
    const songs = document.querySelectorAll('#playlist-detail-songs .playlist-song-row')
    return Boolean(panel && songs.length > 0 && !/\bhidden\b/.test(panel.className))
  }, null, { timeout: 30000 })

  const detail = await page.evaluate(() => ({
    name: document.getElementById('playlist-detail-name')?.textContent?.trim() || '',
    count: document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length,
    firstSong: document.querySelector('#playlist-detail-songs .playlist-song-row b')?.textContent?.trim() || '',
    status: document.getElementById('playlist-detail-status')?.textContent?.trim() || '',
  }))

  assert.equal(detail.name, firstCardName, 'Playlist detail name does not match selected card')
  assert.ok(detail.count > 0, 'Playlist detail contains no songs')
  assert.ok(detail.firstSong, 'Playlist detail first song is missing')

  await page.locator('#playlist-detail-songs .playlist-song-row').first().getByRole('button', { name: '播放' }).click()
  await page.waitForFunction(expected => {
    return (document.getElementById('player-title')?.textContent || '').trim() === expected
  }, detail.firstSong, { timeout: 5000 })

  await page.locator('#playlist-back-btn').click()
  await page.waitForFunction(() => {
    const panel = document.getElementById('playlist-detail-panel')
    return Boolean(panel && /\bhidden\b/.test(panel.className))
  }, null, { timeout: 5000 })

  assert.equal(pageErrors.length, 0, 'Browser page errors: ' + pageErrors.join(' | '))
  console.log('PASS: playlist search -> open detail -> song list -> play -> back')
  console.log(JSON.stringify(detail))
} finally {
  await browser.close()
}
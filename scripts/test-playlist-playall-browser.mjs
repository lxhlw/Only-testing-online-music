import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 360, height: 640 },
  userAgent: 'Mozilla/5.0 (Linux; Android 4.4.2; Via) AppleWebKit/537.36 Mobile Safari/537.36'
})
const errors = []
page.on('pageerror', e => errors.push(String(e)))
await page.addInitScript(() => {
  localStorage.setItem('only-testing-online-music.default-source-disabled', '1')
})
const songs = Array.from({ length: 101 }, (_, index) => ({
  id: String(index + 1), songId: String(index + 1),
  name: 'Song ' + (index + 1), singer: 'Test Singer',
  source: 'wy', interval: 180000
}))
const playlist = { id: 'all-51', name: 'Sequence test', trackCount: 101, creator: 'Test' }
let loadedSecondPage = 0
let loadedThirdPage = 0
await page.route('**/api/netease-playlists?*', async route => {
  const url = new URL(route.request().url())
  if (!url.searchParams.has('id')) {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ result: { playlists: [playlist], playlistCount: 1 } })
    })
    return
  }
  const offset = Number(url.searchParams.get('offset') || 0)
  if (offset === 50) loadedSecondPage++
  if (offset === 100) loadedThirdPage++
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      playlist,
      songs: songs.slice(offset, offset + 50),
      hasMore: offset + 50 < songs.length,
      nextOffset: Math.min(offset + 50, songs.length)
    })
  })
})
await page.route('**/api/proxy?url=*', async route => {
  const target = new URL(route.request().url()).searchParams.get('url') || ''
  if (target.includes('playlist-audio.invalid')) {
    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: '' })
    return
  }
  await route.continue()
})
await page.route('https://playlist-audio.invalid/**', route =>
  route.fulfill({ status: 200, contentType: 'audio/mpeg', body: '' }))
try {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    // The page's native same-platform resolver can be deterministically
    // exercised without depending on current third-party music availability.
    window.LXSourceManager.getActive = function () { return null }
    window.LXMusicSearch.resolveMusicUrl = function (source, info, quality, cb) {
      cb(null, { url: 'https://playlist-audio.invalid/song.mp3', provider: 'netease-native' })
    }
    const audio = document.getElementById('audio')
    audio.load = function () {}
    audio.play = function () { return Promise.resolve() }
  })
  await page.locator('.nav-item[data-view="playlist"]').click()
  await page.locator('#playlist-featured .playlist-open-button').first().click()
  await page.waitForFunction(() =>
    document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length === 50)
  await page.locator('#playlist-play-all-btn').click()
  const first = await page.evaluate(() => ({
    ids: window.LXMusicLibrary.snapshot().queue.map(track => track.id),
    title: document.getElementById('player-title').textContent
  }))
  assert.equal(first.ids.length, 50)
  assert.deepEqual(first.ids.slice(0, 4), ['1', '2', '3', '4'])
  assert.equal(first.ids[49], '50')
  assert.equal(first.title, 'Song 1')
  console.log('PASS: playlist Play All queues 1..50 in the original order')

  await page.locator('#next-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(), 'Song 2')
  await page.locator('#prev-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(), 'Song 1')
  console.log('PASS: Next and Previous navigate in correct track order')

  // Simulate genuine media progress followed by the native ended event;
  // this must use the same session next-track sequence as the Next button.
  await page.evaluate(() => {
    const audio = document.getElementById('audio')
    Object.defineProperty(audio, 'readyState', { configurable: true, get: () => 4 })
    Object.defineProperty(audio, 'duration', { configurable: true, get: () => 180 })
    Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => 175 })
    if (audio.onplaying) audio.onplaying()
    if (audio.onended) audio.onended()
  })
  assert.equal(await page.locator('#player-title').textContent(), 'Song 2')
  console.log('PASS: ending track 1 automatically starts track 2')

  await page.evaluate(() => {
    for (let i = 0; i < 41; i++) document.getElementById('next-track-btn').click()
  })
  assert.equal(await page.locator('#player-title').textContent(), 'Song 43')
  // The next page is requested when we are within eight tracks of the end.
  await page.waitForTimeout(400)
  assert.equal(loadedSecondPage, 1, 'The 51st song page should be fetched once, near track 50')

  await page.evaluate(() => {
    for (let i = 0; i < 8; i++) document.getElementById('next-track-btn').click()
  })
  await page.waitForFunction(() => document.getElementById('player-title').textContent === 'Song 51')
  const after = await page.evaluate(() => ({
    title: document.getElementById('player-title').textContent,
    ids: window.LXMusicLibrary.snapshot().queue.map(x => x.id)
  }))
  assert.equal(after.title, 'Song 51')
  assert.ok(after.ids.includes('51'), 'The next queue window must include song 51')
  await page.locator('#prev-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(), 'Song 50')
  await page.locator('#next-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(), 'Song 51')
  console.log('PASS: crossing track 50 to 51 without resetting the playlist')

  // A playlist longer than the 100-track persisted queue must still reach
  // track 101 and allow Back/Next without reordering the active session.
  await page.locator('#next-track-btn').click()
  await page.evaluate(() => {
    for (let i = 0; i < 41; i++) document.getElementById('next-track-btn').click()
  })
  assert.equal(await page.locator('#player-title').textContent(), 'Song 93')
  await page.waitForTimeout(400)
  assert.equal(loadedThirdPage, 1, 'The third page should be prefetched near track 100')
  await page.evaluate(() => {
    for (let i = 0; i < 8; i++) document.getElementById('next-track-btn').click()
  })
  assert.equal(await page.locator('#player-title').textContent(), 'Song 101')
  const finalQueue = await page.evaluate(() => window.LXMusicLibrary.snapshot().queue)
  assert.equal(finalQueue.length, 100, 'Old Via devices should retain the most useful 100-track window')
  assert.ok(finalQueue.some(track => track.id === '101'), 'Rolling queue must include track 101')
  await page.locator('#prev-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(), 'Song 100')
  await page.locator('#next-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(), 'Song 101')
  await page.locator('#next-track-btn').click()
  assert.match(await page.locator('#status').textContent(), /已经是歌单最后一首/)
  console.log('PASS: track 100 to 101 with bounded queue, Back and real last-track guard')
  // Any song row is directly clickable. Selecting one midway must start
  // from that position, show an active-row state and retain song order.
  await page.locator('#playlist-detail-songs .playlist-song-row').nth(6).click()
  assert.equal(await page.locator('#player-title').textContent(), 'Song 7')
  assert.equal(await page.locator('#playlist-detail-songs .playlist-song-row.is-playing').count(), 1)
  assert.equal(await page.locator('#playlist-detail-songs .playlist-song-row.is-playing').getAttribute('data-track-index'), '6')
  await page.locator('#next-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(), 'Song 8')
  assert.equal(await page.locator('#playlist-detail-songs .playlist-song-row.is-playing').getAttribute('data-track-index'), '7')
  await page.locator('#prev-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(), 'Song 7')
  console.log('PASS: click a middle playlist row, highlight it and keep Next/Previous in song order')

  const seventh = page.locator('#playlist-detail-songs .playlist-song-row').nth(6)
  await seventh.locator('.playlist-add-queue').click()
  assert.equal(await page.locator('#player-title').textContent(), 'Song 7', 'Queue-only button must not launch playback')
  await seventh.locator('.playlist-fav-song').click()
  assert.equal(await page.locator('#player-title').textContent(), 'Song 7', 'Favorite button must not launch playback')
  await page.locator('#playlist-detail-songs .playlist-song-row').nth(9).focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('#player-title').textContent(), 'Song 10')
  await page.locator('#playlist-detail-songs .playlist-song-row').nth(3).locator('.playlist-song-play').click()
  assert.equal(await page.locator('#player-title').textContent(), 'Song 4')
  console.log('PASS: keyboard and explicit Play button select arbitrary tracks without duplicate click playback')

  const mobileLayout = await page.evaluate(() => {
    const row = document.querySelector('#playlist-detail-songs .playlist-song-row')
    const actions = row.querySelector('.playlist-song-actions')
    const title = row.querySelector('.song-main')
    return {
      rowWidth: row.getBoundingClientRect().width,
      actionsRight: actions.getBoundingClientRect().right,
      titleRight: title.getBoundingClientRect().right,
      viewportWidth: document.documentElement.clientWidth,
      artistDisplay: getComputedStyle(row.querySelector('.playlist-song-artist')).display
    }
  })
  assert.ok(mobileLayout.actionsRight <= mobileLayout.viewportWidth + 1, 'All playlist controls must fit old mobile screens')
  assert.ok(mobileLayout.titleRight <= mobileLayout.actionsRight, 'Song title must not overlap buttons')
  assert.equal(mobileLayout.artistDisplay, 'none', 'Small screens hide secondary columns for uncluttered touch targets')
  console.log('PASS: Via mobile playlist controls remain within viewport')

  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}

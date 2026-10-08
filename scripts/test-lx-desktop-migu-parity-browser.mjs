import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } })
const errors = []
page.on('pageerror', err => errors.push(String(err)))
try {
  await page.addInitScript(() => localStorage.clear())
  await page.route('**/api/proxy?url=*', async route => {
    const parsed = new URL(route.request().url())
    const original = parsed.searchParams.get('url')
    if (original?.startsWith('https://lxmusicapi.onrender.com/url/mg/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, url: 'https://media.migu.cn/demo-audio.mp3' })
      })
      return
    }
    await route.continue()
  })
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.evaluate(() => new Promise((resolve, reject) => {
    window.LXSourceManager.installBuiltinHuibq((err) => err ? reject(err) : resolve())
  }))
  await page.waitForFunction(() => {
    const active = window.LXSourceManager?.getActive?.()
    return Boolean(active?.runtime && active.inited && active.sources?.mg &&
      window.OnlyTestingMusicApp?.playMusic)
  }, null, { timeout: 12000 })

  async function verify(track, expectedId, qualityLabel) {
    const requestPromise = page.waitForRequest(req => {
      if (!req.url().includes('/api/proxy?url=')) return false
      try {
        const target = new URL(new URL(req.url()).searchParams.get('url'))
        return target.host === 'lxmusicapi.onrender.com' &&
          target.pathname.startsWith('/url/mg/')
      } catch { return false }
    }, { timeout: 12000 })
    await page.evaluate(info => window.OnlyTestingMusicApp.playMusic(info), track)
    const req = await requestPromise
    const upstream = new URL(new URL(req.url()).searchParams.get('url'))
    const path = upstream.pathname.split('/')
    const requestedId = decodeURIComponent(path[3] || '')
    assert.equal(requestedId, expectedId,
      'Huibq must request exactly the same track identifier as LX Desktop')
    const customHeaders = JSON.parse(req.headers()['x-lx-headers'] || '{}')
    assert.equal(customHeaders['User-Agent'], 'lx-music-desktop/2.0.0',
      'Source-specified LX Desktop User-Agent must be preserved in proxy payload')
    assert.equal(customHeaders['Content-Type'], 'application/json')
    assert.ok(typeof customHeaders['X-Request-Key'] === 'string' &&
      customHeaders['X-Request-Key'].length > 0,
      'Source request key must remain attached to the primary intended host')
    assert.equal(path[2], 'mg')
    assert.ok(['128k','320k'].includes(path[4]),
      'Migu quality must be supported by the imported LX source')
    console.log('PASS: '+qualityLabel+' uses correct desktop identifier and source request headers')
  }

  await verify({
    source: 'mg', id: 'COPYRIGHT-FIXTURE-A',
    songmid: 'DESKTOP-SONGID-A', copyrightId: 'COPYRIGHT-FIXTURE-A',
    hash: '', name: 'Fixture Migu A', singer: 'Fixture Artist'
  }, 'DESKTOP-SONGID-A', 'blank hash')

  await verify({
    source: 'mg', id: 'COPYRIGHT-FIXTURE-B',
    songmid: 'DESKTOP-SONGID-B', copyrightId: 'COPYRIGHT-FIXTURE-B',
    hash: 'CUSTOM-HASH-B', name: 'Fixture Migu B', singer: 'Fixture Artist'
  }, 'CUSTOM-HASH-B', 'genuine hash')

  assert.deepEqual(errors, [], 'No unexpected page JavaScript errors')
  console.log('PASS: deterministic desktop Migu songmid, hash and header parity in Chromium')
} finally {
  await browser.close()
}

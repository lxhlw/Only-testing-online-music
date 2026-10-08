import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
const errors = []
page.on('pageerror', err => errors.push(String(err)))

const readState = () => page.evaluate(() => ({
  text: document.querySelector('#status')?.textContent || '',
  src: document.querySelector('#audio')?.getAttribute('src') || '',
  pending: (window.__pendingAudioActions || []).length,
  fallback: (window.__pendingFallbacks || []).length
}))

try {
  await page.addInitScript(() => {
    localStorage.clear()
    const code = 'window.lx.send(window.lx.EVENT_NAMES.inited, {status: true, sources: {mg: {name: "咪咕音乐", actions: ["musicUrl"], qualitys: ["320k","128k"]}}});'
    localStorage.setItem('only-testing-online-music.lx-sources', JSON.stringify([
      { id: 'fixture-mg-deadline', name: 'Migu Deadline Test', url: 'https://fixture.example/mg.js', code }
    ]))
    localStorage.setItem('only-testing-online-music.active-source-id','fixture-mg-deadline')
  })
  await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(() => {
    const a = window.LXSourceManager?.getActive?.()
    return Boolean(a?.inited && a?.sources?.mg && window.OnlyTestingMusicApp?.playMusic)
  }, null, { timeout: 12000 })
  await page.clock.install({ time: new Date('2026-10-09T08:00:00+08:00') })
  await page.evaluate(() => {
    window.__pendingAudioActions = []
    window.__pendingFallbacks = []
    const original = window.LXSourceManager.requestAction
    window.LXSourceManager.requestAction = function (source, action, info, cb) {
      if (source === 'mg' && action === 'musicUrl') {
        window.__pendingAudioActions.push(cb)
        return
      }
      return original.call(this, source, action, info, cb)
    }
    window.LXMusicSearch.resolveMusicUrl = function (source, info, quality, cb) {
      window.__pendingFallbacks.push(cb)
    }
  })

  const play = title => page.evaluate(title =>
    window.OnlyTestingMusicApp.playMusic({ source: 'mg', id: 'fixture-' + title,
      copyrightId: 'fixture-copyright-' + title, songmid: 'fixture-' + title,
      name: title, singer: 'Fixture Artist' }), title)

  await play('hanging-one')
  assert.equal((await readState()).pending, 1)
  await page.clock.runFor(8001)
  assert.equal((await readState()).fallback, 1, 'Primary source should enter fallback after 8s')
  await page.clock.runFor(16998)
  assert.doesNotMatch((await readState()).text, /已停止本次等待/,
    'Deadline must not fire before 25s')

  await page.clock.runFor(1)
  let first = await readState()
  assert.match(first.text, /咪咕播放已等待 25 秒/)
  assert.equal(first.src, '')
  console.log('PASS: Migu first unresolved play ends at 25-second bound, no stale audio')

  await page.evaluate(() => {
    window.__pendingAudioActions[0](null, 'https://late.example.test/late.mp3')
    window.__pendingFallbacks[0](null, {
      url: 'https://late.example.test/fallback.mp3', provider: 'migu-native'
    })
  })
  first = await readState()
  assert.equal(first.src, '', 'Late resolver callback must never attach a stale stream')
  assert.match(first.text, /已停止本次等待/)
  console.log('PASS: late original and fallback callbacks cannot resurrect timed-out music')

  await play('switching-old')
  await page.clock.runFor(10000)
  const currentCallbacks = (await readState()).pending
  await play('switching-new')
  await page.clock.runFor(15010)
  assert.doesNotMatch((await readState()).text, /已停止本次等待/,
    'Prior song must not expire a newly clicked song')
  await page.clock.runFor(9990)
  assert.match((await readState()).text, /咪咕播放已等待 25 秒/)
  assert.ok((await readState()).pending >= currentCallbacks + 1)
  console.log('PASS: clicking another song cancels previous deadline and permits new attempt')

  assert.deepEqual(errors, [], 'No uncaught errors on page')
} finally {
  await browser.close()
}

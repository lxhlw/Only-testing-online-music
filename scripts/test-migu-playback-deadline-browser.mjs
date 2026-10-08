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
      { id: 'fixture-mg-deadline', name: 'Migu Deadline Test', url: 'https://fixture.example/mg.js', code },
      { id: 'fixture-mg-other', name: 'Other Migu Source', url: 'https://fixture.example/other.js', code }
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

  await play('before-source-change')
  await page.evaluate(() => window.LXSourceManager.activate('fixture-mg-other'))
  await page.clock.runFor(26000)
  const changed = await readState()
  assert.doesNotMatch(changed.text, /咪咕播放已等待 25 秒/,
    'Previously selected source must not overwrite the new source status')
  assert.equal(changed.src, '')
  await page.evaluate(() => {
    const callbacks = window.__pendingAudioActions
    callbacks[callbacks.length - 1](null, 'https://old-source.invalid/song.mp3')
  })
  assert.equal((await readState()).src, '', 'Late audio URL from deselected source must be ignored')
  console.log('PASS: switching the LX source immediately invalidates its outstanding Migu playback')

  // Prevent a real media connection; control the HTMLAudioElement properties
  // to reproduce a provider stream reporting 0.35s of progress before
  // stalling, which previously cleared the 25-second timer too early.
  await page.route('https://media.migu.cn/mock.mp3', async () => {})
  await page.evaluate(() => {
    const audio = document.querySelector('#audio')
    window.__mockMiguAudio = { time: 0, duration: 240, readyState: 3, paused: false, ended: false }
    for (const name of ['currentTime', 'duration', 'readyState', 'paused', 'ended']) {
      const key = name === 'currentTime' ? 'time' : name
      Object.defineProperty(audio, name, {
        configurable: true,
        get() { return window.__mockMiguAudio[key] }
      })
    }
    audio.load = function () {}
    audio.pause = function () { window.__mockMiguAudio.paused = true }
  })
  const triggerSyntheticProgress = async value => {
    await page.evaluate(seconds => {
      const audio = document.querySelector('#audio')
      window.__mockMiguAudio.time = seconds
      window.__mockMiguAudio.paused = false
      if (typeof audio.ontimeupdate === 'function') audio.ontimeupdate()
    }, value)
  }
  await play('short-start-then-stall')
  await page.evaluate(() => {
    const calls = window.__pendingAudioActions
    calls[calls.length - 1](null, 'https://media.migu.cn/mock.mp3')
  })
  await triggerSyntheticProgress(.35)
  assert.match((await readState()).text, /正在播放/, '0.35s provisional audio first appears playing')
  await page.clock.runFor(24000)
  assert.doesNotMatch((await readState()).text, /已停止本次等待/)
  await page.clock.runFor(1200)
  assert.match((await readState()).text, /咪咕播放已等待 25 秒/,
    '0.35s of fake progress must not cancel the original 25s deadline')
  console.log('PASS: short transient audio progress does not suppress 25s Migu deadline')

  await play('genuine-continuous-audio')
  await page.evaluate(() => {
    const calls = window.__pendingAudioActions
    calls[calls.length - 1](null, 'https://media.migu.cn/mock.mp3')
  })
  await triggerSyntheticProgress(.5)
  for (let i = 1; i <= 6; i += 1) {
    await page.clock.runFor(4000)
    await triggerSyntheticProgress(i * 4)
  }
  await page.clock.runFor(1000)
  assert.match((await readState()).text, /正在播放/,
    'Continuously advancing, plausible music must stay playing at 25s')
  await page.clock.runFor(2000)
  assert.doesNotMatch((await readState()).text, /已停止本次等待/,
    'Genuine playback should not be interrupted by the Migu deadline')
  console.log('PASS: genuine uninterrupted audio progress survives the 25s checkpoint')

  assert.deepEqual(errors, [], 'No uncaught errors on page')
} finally {
  await browser.close()
}

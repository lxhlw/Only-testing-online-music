import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import dns from 'node:dns/promises'
import tls from 'node:tls'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const SOURCE_URL = process.env.LX_SOURCE_URL || 'https://raw.githubusercontent.com/pdone/lx-music-source/main/sixyin/latest.js'
const KEYWORD = '成都'
const VERSION = process.env.LX_SOURCE_NAME || 'unknown'
const INIT_TIMEOUT = Number(process.env.SIXYIN_INIT_TIMEOUT_MS || 30000)

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors = []
const failedResponses = []
const proxyTargets = []

page.on('pageerror', error => pageErrors.push(String(error)))
page.on('requestfailed', request => console.log('REQUEST FAILED:', request.method(), request.url(), request.failure()?.errorText || 'unknown'))
page.on('request', request => {
  const url = request.url()
  if (url.includes('/api/proxy?url=')) {
    try {
      const target = new URL(url).searchParams.get('url')
      if (target) proxyTargets.push({ method: request.method(), target })
    } catch {}
  }
})
page.on('response', response => {
  if (response.status() >= 400) failedResponses.push(
    response.status() + ' ' + response.request().method() + ' ' + response.url()
  )
})

try {
  console.log('LX source:', VERSION)
  console.log('Source URL:', SOURCE_URL)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  assert.equal(await page.locator('#install-btn').isVisible(), true, 'App did not load')

  await page.locator('#source-url').fill(SOURCE_URL)
  await page.locator('#install-btn').click()

  await page.waitForFunction(
    () => {
      const manager = window.LXSourceManager
      const items = manager && manager.getSources ? manager.getSources() : []
      return Boolean(items.length && items[0].inited && items[0].runtime && items[0].sources)
    },
    null,
    { timeout: INIT_TIMEOUT }
  )

  const sourceState = await page.evaluate(() => {
    const items = window.LXSourceManager.getSources()
    const active = window.LXSourceManager.getActive()
    return {
      count: items.length,
      activeName: active && active.name,
      inited: Boolean(active && active.inited),
      sources: active && active.sources ? Object.keys(active.sources) : [],
      error: active && active.error
    }
  })

  assert.equal(sourceState.inited, true, 'SixYin did not finish initialization')
  assert.ok(sourceState.sources.length > 0, 'SixYin initialized without source entries')

  console.log('PASS: original SixYin initialized in real Chromium')
  console.log('Source:', sourceState.activeName)
  console.log('Supported sources:', sourceState.sources.join(', '))

  await page.locator('#search-input').fill(KEYWORD)
  await page.locator('#search-btn').click()

  await page.waitForFunction(
    () => document.querySelectorAll('#search-results .search-row').length > 0,
    null,
    { timeout: 60000 }
  )

  const searchState = await page.evaluate(() => ({
    keyword: document.getElementById('search-input').value,
    count: document.querySelectorAll('#search-results .search-row').length,
    firstTitle: (document.querySelector('#search-results .search-row b') || {}).textContent || ''
  }))

  assert.equal(searchState.keyword, KEYWORD)
  assert.ok(searchState.count > 0, 'Search returned no songs')

  console.log('PASS: browser search for 成都')
  console.log('Search results:', searchState.count)
  console.log('First result:', searchState.firstTitle)

  const rows = page.locator('#search-results .search-row')
  const rowCount = await rows.count()
  const testCount = Math.min(5, rowCount)
  assert.ok(testCount > 0, 'No search rows available for playback testing')

  const attempts = []
  let playbackPassed = false

  for (let i = 0; i < testCount; i += 1) {
    const row = rows.nth(i)
    const title = await row.locator('b').textContent()
    const singer = await row.locator('span').textContent()
    const button = row.getByRole('button', { name: 'LX musicUrl 测试' })
    console.log('\n--- Playback candidate ' + (i + 1) + '/' + testCount + ' ---')
    console.log('Song:', title, '-', singer)

    await button.click()

    try {
      await page.waitForFunction(
        () => {
          const text = document.getElementById('status')?.textContent || ''
          return /LX musicUrl (已返回播放地址|失败|返回了无效结果)/.test(text)
        },
        null,
        { timeout: 30000 }
      )

      const status = await page.locator('#status').textContent()
      const src = await page.locator('#audio').getAttribute('src')
      const attempt = { index: i + 1, title, singer, status, src, probe: null, playback: null }

      console.log('Status:', status)
      console.log('Resolved audio src:', src || 'none')

      if (!src || !/^https?:/i.test(src) || !/已返回播放地址/.test(status)) {
        attempts.push(attempt)
        continue
      }

      try {
        const probe = await fetch(src, {
          redirect: 'manual',
          headers: { 'User-Agent': 'lx-music-web/2.0.0' }
        })
        const probeBody = await probe.text()
        attempt.probe = {
          status: probe.status,
          statusText: probe.statusText,
          contentType: probe.headers.get('content-type') || '',
          location: probe.headers.get('location') || '',
          contentLength: probe.headers.get('content-length') || '',
          body: probeBody.slice(0, 300)
        }
        console.log('Probe:', JSON.stringify(attempt.probe))
      } catch (error) {
        attempt.probe = { error: String(error), cause: error?.cause ? String(error.cause) : '' }
        console.log('Probe error:', JSON.stringify(attempt.probe))
      }

      await page.evaluate(() => {
        const audio = document.getElementById('audio')
        audio.pause()
        audio.currentTime = 0
        audio.preload = 'auto'
        audio.muted = true
        audio.load()
      })

      try {
        await page.evaluate(async () => {
          const audio = document.getElementById('audio')
          if (!audio) throw new Error('Audio element not found')
          await audio.play()
        })

        await page.waitForFunction(
          () => {
            const audio = document.getElementById('audio')
            return Boolean(audio && audio.readyState >= 2)
          },
          null,
          { timeout: 12000 }
        )

        await page.waitForFunction(
          () => {
            const audio = document.getElementById('audio')
            return Boolean(audio && audio.currentTime > 0.05)
          },
          null,
          { timeout: 12000 }
        )

        const playback = await page.evaluate(() => {
          const audio = document.getElementById('audio')
          return {
            readyState: audio.readyState,
            currentTime: audio.currentTime,
            paused: audio.paused,
            networkState: audio.networkState,
            error: audio.error ? {
              code: audio.error.code,
              message: audio.error.message || ''
            } : null
          }
        })
        attempt.playback = playback
        console.log('Playback:', JSON.stringify(playback))

        if (playback.readyState >= 2 && playback.currentTime > 0.05) {
          playbackPassed = true
          attempts.push(attempt)
          console.log('PASS: candidate produced actual HTML5 playback')
          break
        }
      } catch (error) {
        attempt.playback = {
          error: String(error),
          cause: error?.cause ? String(error.cause) : ''
        }
        console.log('Playback error:', JSON.stringify(attempt.playback))
      }

      attempts.push(attempt)
    } catch (error) {
      attempts.push({
        index: i + 1,
        title,
        singer,
        status: await page.locator('#status').textContent().catch(() => ''),
        src: await page.locator('#audio').getAttribute('src').catch(() => null),
        error: String(error)
      })
    }
  }

  console.log('\nPlayback attempts:', JSON.stringify(attempts, null, 2))
  assert.equal(playbackPassed, true, 'None of the first ' + testCount + ' search results produced actual HTML5 playback')

  const finalState = await page.evaluate(() => {
    const audio = document.getElementById('audio')
    return {
      tagName: audio && audio.tagName,
      src: audio && audio.src,
      readyState: audio && audio.readyState,
      currentTime: audio && audio.currentTime,
      paused: audio && audio.paused,
      networkState: audio && audio.networkState,
      status: document.getElementById('status').textContent || ''
    }
  })

  assert.equal(finalState.tagName, 'AUDIO')
  assert.match(finalState.src, /^https?:/i)
  assert.ok(finalState.readyState >= 2, 'Audio did not reach HAVE_CURRENT_DATA')
  assert.ok(Number(finalState.currentTime) > 0.05, 'Audio did not advance playback time')

  console.log('PASS: at least one 成都 result reached real HTML5 playback')
} catch (error) {
      console.log('AUDIO PROBE ERROR:', String(error))
      if (error && error.cause) console.log('AUDIO PROBE CAUSE:', String(error.cause))
    }
  }

  await page.evaluate(() => {
    const audio = document.getElementById('audio')
    return audio.play().catch(error => {
      throw new Error('Audio.play() failed: ' + error.message)
    })
  })

  await page.waitForFunction(
    () => {
      const audio = document.getElementById('audio')
      return Boolean(audio && audio.readyState >= 2)
    },
    null,
    { timeout: 20000 }
  )

  await page.waitForFunction(
    () => {
      const audio = document.getElementById('audio')
      return Boolean(audio && audio.currentTime > 0.05)
    },
    null,
    { timeout: 20000 }
  )

  const playbackState = await page.evaluate(() => {
    const audio = document.getElementById('audio')
    return {
      tagName: audio && audio.tagName,
      src: audio && audio.src,
      readyState: audio && audio.readyState,
      currentTime: audio && audio.currentTime,
      paused: audio && audio.paused,
      networkState: audio && audio.networkState,
      status: document.getElementById('status').textContent || ''
    }
  })

  assert.equal(playbackState.tagName, 'AUDIO')
  assert.match(playbackState.src, /^https?:/i)
  assert.ok(playbackState.readyState >= 2, 'Audio did not reach HAVE_CURRENT_DATA')
  assert.ok(Number(playbackState.currentTime) > 0.05, 'Audio did not advance playback time')
  assert.match(playbackState.status, /musicUrl 已返回播放地址/)

  console.log('PASS: original SixYin musicUrl returned an HTTP(S) URL')
  console.log('Audio src:', playbackState.src)
  console.log('Audio readyState:', playbackState.readyState)
  console.log('PASS: HTML5 Audio received the SixYin playback URL')
} catch (error) {
  console.error('SIXYIN BROWSER TEST FAILED')
  console.error(error && error.stack ? error.stack : error)
  console.error(
    'Page status:',
    await page.locator('#status').textContent().catch(() => 'unavailable')
  )
  console.error('Proxy targets:', JSON.stringify(proxyTargets, null, 2))
  if (proxyTargets.length) {
    for (const item of proxyTargets.slice(-5)) {
      try {
        const direct = await fetch(item.target, {
          method: item.method,
          headers: { 'User-Agent': 'lx-music-web/2.0.0', 'Content-Type': 'application/json' },
          redirect: 'manual'
        })
        const body = await direct.text()
        console.error('DIRECT RUNNER FETCH:', item.method, item.target)
        console.error('DIRECT STATUS:', direct.status, direct.statusText)
        console.error('DIRECT LOCATION:', direct.headers.get('location') || 'none')
        console.error('DIRECT BODY:', body.slice(0, 2000))
      } catch (error) {
        console.error('DIRECT RUNNER FETCH ERROR:', item.target)
        console.error('DIRECT ERROR:', String(error))
        console.error('DIRECT ERROR NAME:', error && error.name ? error.name : 'unknown')
        console.error('DIRECT ERROR MESSAGE:', error && error.message ? error.message : 'unknown')
        console.error('DIRECT ERROR CAUSE:', error && error.cause ? String(error.cause) : 'none')
        if (error && error.cause) {
          console.error('DIRECT CAUSE CODE:', error.cause.code || 'none')
          console.error('DIRECT CAUSE ERRNO:', error.cause.errno || 'none')
          console.error('DIRECT CAUSE SYSCALL:', error.cause.syscall || 'none')
          console.error('DIRECT CAUSE HOSTNAME:', error.cause.hostname || 'none')
        }
        try {
          const u = new URL(item.target)
          const addresses = await dns.lookup(u.hostname, { all: true })
          console.error('DNS LOOKUP:', JSON.stringify(addresses))
          await new Promise((resolve, reject) => {
            const socket = tls.connect({
              host: u.hostname,
              port: u.port ? Number(u.port) : 443,
              servername: u.hostname,
              rejectUnauthorized: true,
              timeout: 10000
            })
            socket.once('secureConnect', () => {
              console.error('TLS CONNECT: OK')
              console.error('TLS PROTOCOL:', socket.getProtocol() || 'unknown')
              console.error('TLS AUTH:', socket.authorized ? 'authorized' : 'not-authorized')
              socket.end()
              resolve()
            })
            socket.once('error', reject)
            socket.once('timeout', () => {
              socket.destroy()
              reject(new Error('TLS socket timeout'))
            })
          })
        } catch (diagError) {
          console.error('NETWORK DIAGNOSTIC ERROR:', String(diagError))
          if (diagError && diagError.cause) console.error('NETWORK DIAGNOSTIC CAUSE:', String(diagError.cause))
          if (diagError && diagError.code) console.error('NETWORK DIAGNOSTIC CODE:', diagError.code)
        }
      }
    }
  }
  console.error('LX request trace:', JSON.stringify(await page.evaluate(() => {
    const active = window.LXSourceManager && window.LXSourceManager.getActive
      ? window.LXSourceManager.getActive() : null
    return active && active.runtime && active.runtime.__debugRequests
      ? active.runtime.__debugRequests : []
  }).catch(() => []), null, 2))
  console.error('Page errors:', pageErrors.join('\n') || 'none')
  console.error('Failed responses:', failedResponses.join('\n') || 'none')
  process.exitCode = 1
} finally {
  await browser.close()
}

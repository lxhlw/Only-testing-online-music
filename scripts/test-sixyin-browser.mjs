import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const SOURCE_URL = process.env.LX_SOURCE_URL || 'https://raw.githubusercontent.com/pdone/lx-music-source/main/qdy/latest.js'
const SOURCE_NAME = process.env.LX_SOURCE_NAME || 'unknown'
const KEYWORD = '成都'
const INIT_TIMEOUT = Number(process.env.SIXYIN_INIT_TIMEOUT_MS || 30000)
const CANDIDATE_COUNT = Number(process.env.PLAYBACK_CANDIDATES || 5)
const MIN_PLAYBACK_SECONDS = Number(process.env.MIN_PLAYBACK_SECONDS || 0.5)

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pageErrors = []
const failedResponses = []
const proxyTargets = []

page.on('pageerror', error => pageErrors.push(String(error)))
page.on('console', message => {
  if (message.type() === 'error') console.log('BROWSER ERROR:', message.text())
})
page.on('requestfailed', request => {
  console.log('REQUEST FAILED:', request.method(), request.url(), request.failure()?.errorText || 'unknown')
})
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
  if (response.status() >= 400) {
    failedResponses.push(
      response.status() + ' ' + response.request().method() + ' ' + response.url()
    )
  }
})

async function waitForStatus(timeout = 30000) {
  await page.waitForFunction(
    () => {
      const text = document.getElementById('status')?.textContent || ''
      return /LX musicUrl (已返回播放地址|失败|返回了无效结果)/.test(text)
    },
    null,
    { timeout }
  )
}

async function probeMediaUrl(url) {
  const result = { url, status: null, statusText: '', contentType: '', location: '', contentLength: '' }
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'lx-music-web/2.0.0' },
    })
    result.status = response.status
    result.statusText = response.statusText
    result.contentType = response.headers.get('content-type') || ''
    result.location = response.headers.get('location') || ''
    result.contentLength = response.headers.get('content-length') || ''
    try { await response.body?.cancel() } catch {}
  } catch (error) {
    result.error = String(error)
    result.cause = error?.cause ? String(error.cause) : ''
  }
  return result
}

async function tryPlayCurrentAudio() {
  return page.evaluate(async () => {
    const audio = document.getElementById('audio')
    if (!audio) throw new Error('Audio element not found')
    if (!audio.src) throw new Error('Audio source is empty')
    audio.preload = 'auto'
    audio.muted = true
    audio.load()
    await audio.play()
  })
}

try {
  console.log('LX source:', SOURCE_NAME)
  console.log('Source URL:', SOURCE_URL)
  console.log('Base URL:', BASE_URL)

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
      activeName: active?.name || '',
      inited: Boolean(active?.inited),
      sources: active?.sources ? Object.keys(active.sources) : [],
      error: active?.error || '',
    }
  })

  assert.equal(sourceState.inited, true, 'LX source did not finish initialization')
  assert.ok(sourceState.sources.length > 0, 'LX source initialized without source entries')
  console.log('PASS: LX source initialized in real Chromium')
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
  }))

  assert.equal(searchState.keyword, KEYWORD)
  assert.ok(searchState.count > 0, 'Search returned no songs')
  console.log('PASS: browser search for 成都')
  console.log('Search results:', searchState.count)

  const results = await page.evaluate(() => window.__LXLastSearchResults || [])
  const testCount = Math.min(CANDIDATE_COUNT, results.length)
  assert.ok(testCount > 0, 'No search results available for playback testing')

  const attempts = []
  let playbackPassed = false

  for (let i = 0; i < testCount; i += 1) {
    const music = results[i]
    console.log(`\n--- Playback candidate ${i + 1}/${testCount} ---`)
    console.log('Song:', music.name, '-', music.singer)

    const response = await page.evaluate(async musicInfo => {
      const manager = window.LXSourceManager
      return new Promise(resolve => {
        manager.requestAction('tx', 'musicUrl', {
          type: '128k',
          musicInfo: {
            source: 'tx',
            id: musicInfo.id,
            songId: musicInfo.id,
            songmid: musicInfo.songmid,
            mediaMid: musicInfo.mediaMid,
            albumId: musicInfo.albumId,
            name: musicInfo.name,
            singer: musicInfo.singer,
          }
        }, (error, result) => {
          if (error) {
            resolve({ error: error.message || String(error) })
            return
          }
          resolve({
            result: typeof result === 'string' ? result : result?.url || null
          })
        })
      })
    }, music)

    const attempt = {
      index: i + 1,
      title: music.name,
      singer: music.singer,
      musicUrl: response,
      mediaProbe: null,
      playback: null,
    }

    console.log('musicUrl result:', JSON.stringify(response))

    const url = response?.result
    if (!url || !/^https?:/i.test(url)) {
      attempts.push(attempt)
      continue
    }

    attempt.mediaProbe = await probeMediaUrl(url)
    console.log('Media probe:', JSON.stringify(attempt.mediaProbe))

    await page.evaluate(url => {
      const audio = document.getElementById('audio')
      audio.pause()
      audio.src = url
      audio.preload = 'auto'
      audio.muted = true
      audio.load()
    }, url)

    try {
      await tryPlayCurrentAudio()
      await page.waitForFunction(
        () => {
          const audio = document.getElementById('audio')
          return Boolean(audio && audio.readyState >= 2)
        },
        null,
        { timeout: 12000 }
      )
      await page.waitForFunction(
        minSeconds => {
          const audio = document.getElementById('audio')
          return Boolean(audio && audio.currentTime >= minSeconds)
        },
        MIN_PLAYBACK_SECONDS,
        { timeout: 12000 }
      )

      attempt.playback = await page.evaluate(() => {
        const audio = document.getElementById('audio')
        return {
          readyState: audio.readyState,
          currentTime: audio.currentTime,
          paused: audio.paused,
          networkState: audio.networkState,
          error: audio.error ? {
            code: audio.error.code,
            message: audio.error.message || '',
          } : null,
        }
      })

      console.log('Playback:', JSON.stringify(attempt.playback))
      if (attempt.playback.readyState >= 2 && attempt.playback.currentTime >= MIN_PLAYBACK_SECONDS) {
        playbackPassed = true
        attempts.push(attempt)
        console.log('PASS: candidate produced actual HTML5 playback')
        break
      }
    } catch (error) {
      attempt.playback = { error: String(error), cause: error?.cause ? String(error.cause) : '' }
      console.log('Playback error:', JSON.stringify(attempt.playback))
    }

    attempts.push(attempt)
  }

  console.log('\nPlayback attempts:', JSON.stringify(attempts, null, 2))
  assert.equal(
    playbackPassed,
    true,
    'None of the first ' + testCount + ' search results produced actual HTML5 playback'
  )

  console.log('PASS: at least one 成都 result reached real HTML5 playback')
} catch (error) {
  console.error('LX BROWSER TEST FAILED')
  console.error(error?.stack || String(error))
  console.error('Page status:', await page.locator('#status').textContent().catch(() => 'unavailable'))
  console.error('Proxy targets:', JSON.stringify(proxyTargets, null, 2))
  console.error('Page errors:', pageErrors.join('\n') || 'none')
  console.error('Failed responses:', failedResponses.join('\n') || 'none')
  process.exitCode = 1
} finally {
  await browser.close()
}

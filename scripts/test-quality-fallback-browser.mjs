import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const SOURCE_URL = process.env.LX_SOURCE_URL || 'https://raw.githubusercontent.com/pdone/lx-music-source/main/huibq/latest.js'
const KEYWORD = '成都'
const INIT_TIMEOUT_MS = Number(process.env.INIT_TIMEOUT_MS || 30000)
const SEARCH_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 60000)
const PLAYBACK_TIMEOUT_MS = Number(process.env.PLAYBACK_TIMEOUT_MS || 12000)
const FALLBACK_AUDIO_URL = 'https://quality-fallback.invalid/only-testing-online-music.wav'

function createTestWav(seconds = 1, sampleRate = 8000) {
  const channels = 1
  const bitsPerSample = 16
  const sampleCount = Math.max(1, Math.floor(seconds * sampleRate))
  const blockAlign = channels * bitsPerSample / 8
  const byteRate = sampleRate * blockAlign
  const dataSize = sampleCount * blockAlign
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < sampleCount; i += 1) {
    const sample = Math.round(Math.sin((i / sampleRate) * Math.PI * 2 * 440) * 700)
    buffer.writeInt16LE(sample, 44 + i * 2)
  }

  return buffer
}

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const testWav = createTestWav()
const pageErrors = []

page.on('pageerror', error => {
  pageErrors.push(String(error))
})

await page.route('**/api/proxy?url=*', async route => {
  const requestUrl = route.request().url()
  let target = ''
  try {
    target = new URL(requestUrl).searchParams.get('url') || ''
  } catch {}

  if (target.includes('music-api.gdstudio.xyz/api.php')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'quality-test-1',
        name: '成都',
        artist: '赵雷',
        album: 'fallback-test'
      }]),
    })
    return
  }

  await route.continue()
})

await page.route(FALLBACK_AUDIO_URL, async route => {
  await route.fulfill({
    status: 200,
    contentType: 'audio/wav',
    body: testWav,
  })
})

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  assert.equal(await page.locator('#install-btn').isVisible(), true, 'App did not load')

  await page.locator('#source-url').fill(SOURCE_URL)
  await page.locator('#install-btn').click()

  await page.waitForFunction(
    () => {
      const manager = window.LXSourceManager
      const active = manager?.getActive?.()
      return Boolean(active && active.inited && active.runtime && active.sources)
    },
    null,
    { timeout: INIT_TIMEOUT_MS },
  )

  await page.evaluate(() => {
    const settings = {
      qualityMode: 'highest',
      fixedQuality: '320k',
      autoFallback: true,
    }
    window.localStorage.setItem(
      window.LXPlaySettings.storageKey,
      JSON.stringify(settings),
    )

    const manager = window.LXSourceManager
    window.LXMusicSearch.resolveMusicUrl = function (source, musicInfo, quality, callback) {
      callback(new Error('resolver intentionally disabled by quality-isolation test'))
    }
    const original = manager.requestAction
    window.__qualityFallbackCalls = []

    manager.requestAction = function (source, action, info, callback) {
      if (action === 'musicUrl') {
        const quality = String(info?.type || '')
        window.__qualityFallbackCalls.push(quality)

        if (quality === '320k') {
          callback(new Error('forced 320k failure for fallback test'))
          return
        }

        if (quality === '128k') {
          callback(null, 'https://quality-fallback.invalid/only-testing-online-music.wav')
          return
        }
      }

      return original.call(this, source, action, info, callback)
    }
  })

  const txButton = page.locator('#channel-list .channel-button[title="TX"]')
  if (await txButton.count()) {
    await txButton.click()
  } else {
    await page.locator('#channel-list .channel-button').first().click()
  }

  await page.locator('#search-input').fill(KEYWORD)
  await page.locator('#search-btn').click()

  await page.waitForFunction(
    () => document.querySelectorAll('#search-results .search-row').length > 0,
    null,
    { timeout: SEARCH_TIMEOUT_MS },
  )

  const firstResult = page.locator('#search-results .search-row').first()
  const playButton = firstResult.getByRole('button', { name: '解析并播放' })
  assert.equal(await playButton.count(), 1, 'Search result must expose exactly one playback button')
  await playButton.click()

  await page.waitForFunction(
    () => {
      const calls = window.__qualityFallbackCalls || []
      return calls.length >= 2
    },
    null,
    { timeout: 10000 },
  )

  await page.waitForFunction(
    () => {
      const audio = document.getElementById('audio')
      return Boolean(audio && audio.currentTime >= 0.5 && !audio.error)
    },
    null,
    { timeout: PLAYBACK_TIMEOUT_MS },
  )

  const result = await page.evaluate(() => {
    const audio = document.getElementById('audio')
    const calls = window.__qualityFallbackCalls || []
    const status = document.getElementById('status')?.textContent || ''
    return {
      calls,
      status,
      currentTime: Number(audio?.currentTime || 0),
      readyState: Number(audio?.readyState || 0),
      paused: Boolean(audio?.paused),
      error: audio?.error ? {
        code: audio.error.code,
        message: audio.error.message || '',
      } : null,
    }
  })

  assert.deepEqual(result.calls.slice(0, 2), ['320k', '128k'])
  assert.ok(result.status.includes('128k'), 'Final status did not report 128k playback')
  assert.ok(result.readyState >= 2, 'Fallback audio did not reach a playable readyState')
  assert.ok(result.currentTime >= 0.5, 'Fallback audio did not actually advance playback')
  assert.equal(result.error, null, 'Fallback audio reported a media error')
  assert.ok(pageErrors.length === 0, 'Page errors occurred: ' + pageErrors.join('\n'))

  console.log('QUALITY FALLBACK RESULT')
  console.log(JSON.stringify({
    sourceUrl: SOURCE_URL,
    keyword: KEYWORD,
    requestedQualityOrder: result.calls.slice(0, 2),
    finalStatus: result.status,
    readyState: result.readyState,
    currentTime: result.currentTime,
    paused: result.paused,
  }, null, 2))
  console.log('PASS: 320k failure automatically downgraded to 128k and reached real HTML5 playback')
} catch (error) {
  console.error('QUALITY FALLBACK TEST FAILED')
  console.error(error?.stack || String(error))
  console.error('Page status:', await page.locator('#status').textContent().catch(() => 'unavailable'))
  console.error('Quality calls:', await page.evaluate(() => window.__qualityFallbackCalls || []).catch(() => []))
  console.error('Page errors:', pageErrors.join('\n') || 'none')
  process.exitCode = 1
} finally {
  await browser.close()
}

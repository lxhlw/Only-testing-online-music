import crypto from 'node:crypto'

const FLOWER_SOURCE_URL = 'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js'
const KG_SEARCH_URL = 'http://songsearch.kugou.com/song_search_v2?platform=AndroidFilter&iscorrection=1&keyword=%E5%91%A8%E6%9D%B0%E4%BC%A6&hifiquality=0&pagesize=10&PrivilegeFilter=0&page=1'
const CF_PROXY_BASE = 'https://24e6d4a5.only-testing-online-music.pages.dev/api/proxy?url='

const flowerSource = await (await fetch(FLOWER_SOURCE_URL)).text()
const kgResponse = await fetch(KG_SEARCH_URL, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/49.0.2623.112 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
  },
})
const kgBody = await kgResponse.text()
if (!kgResponse.ok) {
  throw new Error('Kugou search failed: HTTP ' + kgResponse.status + ': ' + kgBody.slice(0, 500))
}
const kgData = JSON.parse(kgBody)
if (!kgData?.data?.lists?.length) throw new Error('Kugou search returned no lists')

const rawList = []
for (const item of kgData.data.lists) {
  rawList.push(item)
  if (Array.isArray(item.Grp)) rawList.push(...item.Grp)
}

const seen = new Set()
const candidates = []
for (const item of rawList) {
  const hash = String(item.FileHash || '').toUpperCase()
  const audioId = String(item.Audioid || '')
  if (!hash || !audioId) continue
  const key = audioId + '|' + hash
  if (seen.has(key)) continue
  seen.add(key)
  candidates.push({
    id: audioId,
    songmid: audioId,
    hash,
    name: String(item.OriSongName || item.SongName || ''),
    singer: Array.isArray(item.Singers) ? item.Singers.map(s => String(s?.name || '')).filter(Boolean).join('、') : '',
    albumName: String(item.AlbumName || ''),
    albumId: String(item.AlbumID || ''),
    interval: Number(item.Duration || 0),
  })
  if (candidates.length >= 8) break
}

function captureFlowerRequest(musicInfo) {
  const requests = []
  let handler = null

  const lx = {
    EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert' },
    env: 'desktop',
    version: '2.0.0',
    currentScriptInfo: { name: '野花', version: '1' },
    utils: {
      crypto: {
        md5(value) {
          return crypto.createHash('md5').update(String(value)).digest('hex')
        },
        randomBytes(size) { return crypto.randomBytes(size) },
        aesEncrypt() { throw new Error('aesEncrypt not available in probe') },
        rsaEncrypt() { throw new Error('rsaEncrypt not available in probe') },
      },
      buffer: {
        from(...args) { return Buffer.from(...args) },
        bufToString(buf, format) { return Buffer.from(buf, 'binary').toString(format) },
      },
      zlib: {},
    },
    on(eventName, eventHandler) {
      if (eventName === 'request') handler = eventHandler
      return Promise.resolve()
    },
    send() { return Promise.resolve() },
    request(url, options, callback) {
      requests.push({
        url,
        method: options?.method || 'get',
        headers: options?.headers || {},
      })

      if (url.includes('flower-source-info/latest')) {
        const packageBody = {
          s: 'kw|128k,320k,flac&kg|128k,320k,flac&tx|128k,320k,flac&wy|128k,320k,flac&mg|128k,320k,flac',
          vinfo: { lv: 1, lu: '', lh: '' },
        }
        const response = {
          statusCode: 200,
          statusMessage: 'OK',
          headers: {},
          bytes: JSON.stringify(packageBody).length,
          raw: JSON.stringify(packageBody),
          body: packageBody,
        }
        callback(null, response, packageBody)
        return () => {}
      }

      const fakeResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        bytes: 2,
        raw: '{}',
        body: { code: 0, data: 'https://example.invalid/audio.mp3' },
      }
      callback(null, fakeResponse, fakeResponse.body)
      return () => {}
    },
  }

  const factory = new Function('globalThis', 'console', 'setTimeout', 'clearTimeout', flowerSource + '\n')
  factory({ lx }, { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout)

  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        if (!handler) throw new Error('Flower request handler was not registered')
        try {
          await handler({
            source: 'kg',
            action: 'musicUrl',
            info: { type: '128k', musicInfo },
          })
        } catch (_) {}
        const request = requests.find(item => item.url.includes('/flower/v1/url/kg/'))
        if (!request) throw new Error('Flower did not generate a KG musicUrl request')
        resolve(request)
      } catch (error) {
        reject(error)
      }
    }, 150)
  })
}

const results = []
for (const candidate of candidates) {
  let captured
  try {
    captured = await captureFlowerRequest(candidate)
  } catch (error) {
    results.push({ candidate, captureError: String(error) })
    continue
  }

  let direct
  try {
    const response = await fetch(captured.url, {
      method: 'GET',
      headers: captured.headers,
      redirect: 'follow',
    })
    const body = await response.text()
    direct = {
      status: response.status,
      statusText: response.statusText,
      body: body.slice(0, 1000),
    }
  } catch (error) {
    direct = { error: String(error) }
  }

  let proxy
  try {
    const proxyUrl = CF_PROXY_BASE + encodeURIComponent(captured.url)
    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'X-LX-Headers': JSON.stringify(captured.headers),
      },
    })
    const body = await response.text()
    proxy = {
      status: response.status,
      statusText: response.statusText,
      body: body.slice(0, 1000),
    }
  } catch (error) {
    proxy = { error: String(error) }
  }

  results.push({
    candidate,
    generatedUrl: captured.url,
    generatedHeaders: captured.headers,
    direct,
    proxy,
  })
}

console.log(JSON.stringify({
  searchStatus: kgResponse.status,
  candidateCount: candidates.length,
  results,
}, null, 2))

if (!results.length) throw new Error('No Flower test candidates were generated')
console.log('PASS: real KG search -> Flower request -> direct/proxy comparison completed')
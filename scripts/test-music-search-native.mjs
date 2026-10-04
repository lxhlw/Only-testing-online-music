import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/music-search.js', import.meta.url), 'utf8')

function createHarness(activeSources, requestHandler, xhrResponses) {
  const calls = []
  const responses = xhrResponses || {}
  function FakeXHR() {
    this.readyState = 0
    this.status = 0
    this.responseText = ''
    this.timeout = 0
    this.headers = {}
  }
  FakeXHR.prototype.open = function (method, url) {
    this.method = method
    this.url = url
    this.readyState = 1
  }
  FakeXHR.prototype.setRequestHeader = function (key, value) {
    this.headers[key] = value
  }
  FakeXHR.prototype.send = function (body) {
    const self = this
    self.body = body || null
    calls.push({ xhrMethod: self.method, xhrUrl: self.url, xhrBody: self.body, xhrHeaders: self.headers })
    setTimeout(() => {
      let targetUrl = self.url
      try { targetUrl = decodeURIComponent(self.url) } catch {}
      const response = targetUrl.indexOf('/time') >= 0
        ? (responses.time || { status: 200, body: '1791139200' })
        : (responses.search || { status: 200, body: '[]' })
      self.readyState = 4
      self.status = response.status
      self.responseText = response.body
      if (self.onreadystatechange) self.onreadystatechange()
    }, 0)
  }

  const sandbox = {
    window: null,
    console,
    Date,
    setTimeout,
    clearTimeout,
    XMLHttpRequest: FakeXHR,
    createLXRuntime() {
      return {
        utils: {
          crypto: {
            md5() {
              return '0123456789abcdef0123456789abcdefdeadbeef'
            }
          }
        }
      }
    },
    location: {
      protocol: 'http:',
      host: 'legacy.example',
      origin: 'http://legacy.example',
      href: 'http://legacy.example/'
    },
    LXSourceManager: {
      getActive() {
        return { sources: activeSources }
      },
      requestAction(sourceName, action, info, callback) {
        calls.push({ sourceName, action, info })
        requestHandler(sourceName, action, info, callback)
      }
    }
  }
  sandbox.window = sandbox
  vm.runInNewContext(source, sandbox, { filename: 'music-search.js' })
  return { sandbox, calls }
}

{
  const h = createHarness(
    {
      qsvip: { actions: ['musicSearch', 'musicUrl', 'lyric'] }
    },
    (sourceName, action, info, callback) => {
      callback(null, {
        list: [{ id: 'native-1', name: '成都', singer: '赵雷' }],
        total: 1,
        isEnd: true
      })
    },
    { time: { status: 500, body: 'should not be used' }, search: { status: 500, body: 'should not be used' } }
  )

  const result = await new Promise((resolve, reject) => {
    h.sandbox.LXMusicSearch.search('qsvip', '成都', 1, 20, (err, value) => {
      if (err) reject(err)
      else resolve(value)
    })
  })

  assert.equal(result.list[0].id, 'native-1')
  assert.equal(result.fallbackFrom, undefined)
  assert.equal(h.calls.length, 1)
}

{
  const h = createHarness(
    {
      tx: { actions: ['musicSearch', 'musicUrl'] }
    },
    (sourceName, action, info, callback) => {
      callback(new Error('native search unavailable'))
    },
    {
      time: { status: 200, body: '1791139200' },
      search: {
        status: 200,
        body: JSON.stringify([
          {
            id: 'gd-1',
            name: '成都',
            artist: '赵雷',
            source: 'tencent'
          }
        ])
      }
    }
  )

  const result = await new Promise((resolve, reject) => {
    h.sandbox.LXMusicSearch.search('tx', '成都', 1, 20, (err, value) => {
      if (err) reject(err)
      else resolve(value)
    })
  })

  assert.equal(result.list[0].id, 'gd-1')
  assert.equal(result.list[0].singer, '赵雷')
  assert.equal(result.list[0].source, 'tx')
  assert.equal(result.searchProvider, 'tencent')
  assert.equal(result.fallbackSearch, false)

  const apiCall = h.calls.find(call => call.xhrMethod === 'POST')
  assert.ok(apiCall)
  assert.equal(apiCall.xhrMethod, 'POST')
  assert.match(apiCall.xhrBody, /(^|&)types=search(&|$)/)
  assert.match(apiCall.xhrBody, /(^|&)source=tencent(&|$)/)
  assert.match(apiCall.xhrBody, /(^|&)name=%E6%88%90%E9%83%BD(&|$)/)
  assert.match(apiCall.xhrBody, /(^|&)count=20(&|$)/)
  assert.match(apiCall.xhrBody, /(^|&)pages=1(&|$)/)
  assert.match(apiCall.xhrBody, /(^|&)s=DEADBEEF(&|$)/)

  const h2 = createHarness(
    {
      kg: { actions: ['musicUrl'] }
    },
    () => {},
    {
      time: { status: 200, body: '1791139200' },
      search: {
        status: 400,
        body: 'wrong platform'
      }
    }
  )

  await new Promise(resolve => {
    h2.sandbox.LXMusicSearch.search('kg', '周杰伦', 1, 20, () => resolve())
  })

  const failedCalls = h2.calls.filter(call => call.xhrMethod === 'GET')
  assert.equal(failedCalls.length, 1)
  assert.equal(failedCalls[0].xhrBody, null)
  assert.match(decodeURIComponent(failedCalls[0].xhrUrl), /songsearch\.kugou\.com\/song_search_v2/)
  assert.match(decodeURIComponent(failedCalls[0].xhrUrl), /(^|&)keyword=/)
}


console.log('PASS: native LX search routing and GD fallback')

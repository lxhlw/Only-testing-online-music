import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/music-search.js', import.meta.url), 'utf8')

function createHarness(activeSources, requestHandler, xhrResponse) {
  const calls = []
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
  FakeXHR.prototype.send = function () {
    const self = this
    setTimeout(() => {
      self.readyState = 4
      self.status = xhrResponse.status
      self.responseText = xhrResponse.body
      if (self.onreadystatechange) self.onreadystatechange()
    }, 0)
  }

  const sandbox = {
    window: null,
    console,
    setTimeout,
    clearTimeout,
    XMLHttpRequest: FakeXHR,
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
    { status: 500, body: 'should not be used' }
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
      status: 200,
      body: JSON.stringify([{ id: 'gd-1', name: '成都', artist: '赵雷' }])
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
  assert.equal(result.fallbackFrom, 'native')
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].sourceName, 'tx')
  assert.equal(h.calls[0].action, 'musicSearch')
}

console.log('PASS: native LX search routing and GD fallback')

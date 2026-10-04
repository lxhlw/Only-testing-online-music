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
      const searchIndex = calls.filter(call => {
        return String(call.xhrUrl || '').indexOf('/time') < 0
      }).length - 1
      const searchResponses = Array.isArray(responses.search)
        ? responses.search
        : [responses.search || { status: 200, body: '[]' }]
      const response = targetUrl.indexOf('/time') >= 0
        ? (responses.time || { status: 200, body: '1791139200' })
        : (searchResponses[Math.min(searchIndex, searchResponses.length - 1)] || { status: 200, body: '[]' })
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
      kw: { actions: ['musicUrl'] }
    },
    () => {},
    {
      time: { status: 500, body: 'must not be used' },
      search: {
        status: 200,
        body: JSON.stringify({
          TOTAL: '1',
          SHOW: '1',
          abslist: [
            {
              MUSICRID: 'MUSIC_62355680',
              SONGNAME: '晴天',
              ARTIST: '周杰伦',
              ALBUM: '叶惠美',
              ALBUMID: 'MUSIC_123',
              DURATION: '269',
              N_MINFO: 'level:lossless,bitrate:2000,format:flac,size:30.2M;level:standard,bitrate:128,format:mp3,size:4.2M'
            }
          ]
        })
      }
    }
  )

  const result = await new Promise((resolve, reject) => {
    h.sandbox.LXMusicSearch.search('kw', '周杰伦', 1, 20, (err, value) => {
      if (err) reject(err)
      else resolve(value)
    })
  })

  assert.equal(result.source, 'kw')
  assert.equal(result.searchProvider, 'kuwo-native')
  assert.equal(result.requestedSource, 'kw')
  assert.equal(result.fallbackSearch, false)
  assert.equal(result.list.length, 1)
  assert.equal(result.list[0].id, '62355680')
  assert.equal(result.list[0].songmid, '62355680')
  assert.equal(result.list[0].name, '晴天')
  assert.equal(result.list[0].singer, '周杰伦')
  assert.equal(result.list[0].interval, '04:29')
  assert.deepEqual(result.list[0].types.map(item => item.type), ['128k', 'flac'])

  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].xhrMethod, 'GET')
  assert.equal(h.calls[0].xhrBody, null)
  const kuwoUrl = decodeURIComponent(h.calls[0].xhrUrl)
  assert.match(kuwoUrl, /search\.kuwo\.cn\/r\.s/)
  assert.match(kuwoUrl, /(?:^|&)all=周杰伦(?:&|$)/)
  assert.match(kuwoUrl, /(?:^|&)pn=0(?:&|$)/)
  assert.match(kuwoUrl, /(?:^|&)rn=20(?:&|$)/)
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
      time: { status: 500, body: 'must not be used' },
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

  const error = await new Promise(resolve => {
    h.sandbox.LXMusicSearch.search('tx', '成都', 1, 20, err => resolve(err))
  })

  assert.ok(error)
  assert.match(error.message, /native search unavailable/)
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].sourceName, 'tx')
  assert.equal(h.calls[0].action, 'musicSearch')
}

{
  const h = createHarness(
    {
      tx: { actions: ['musicUrl'] }
    },
    () => {},
    {
      time: { status: 200, body: '1791139200' },
      search: {
        status: 200,
        body: JSON.stringify([
          {
            id: 'tx-good',
            name: '成都',
            artist: '赵雷',
            source: 'tencent'
          },
          {
            id: 'kg-wrong',
            name: '成都',
            artist: '赵雷',
            source: 'kugou'
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

  assert.equal(result.list.length, 1)
  assert.equal(result.list[0].id, 'tx-good')
  assert.equal(result.list[0].source, 'tx')
  assert.equal(result.searchProvider, 'tencent')
  assert.equal(result.requestedSource, 'tx')
  assert.equal(result.fallbackSearch, false)
}

{
  const h2 = createHarness(
    {
      kg: { actions: ['musicUrl'] }
    },
    () => {},
    {
      time: { status: 200, body: '1791139200' },
      search: [
        {
          status: 400,
          body: 'primary unavailable'
        },
        {
          status: 200,
          body: JSON.stringify({
            status: 1,
            error: '',
            data: {
              total: 1,
              info: [
                {
                  audio_id: 778899,
                  hash: 'ABCDEF0123456789ABCDEF0123456789',
                  filename: '周杰伦 - 晴天',
                  songname: '晴天',
                  singername: '周杰伦',
                  album_name: '叶惠美',
                  album_id: '12345',
                  duration: 269,
                  '320hash': 'FEDCBA9876543210FEDCBA9876543210'
                }
              ]
            }
          })
        }
      ]
    }
  )

  const result = await new Promise((resolve, reject) => {
    h2.sandbox.LXMusicSearch.search('kg', '周杰伦', 1, 20, (err, value) => {
      if (err) reject(err)
      else resolve(value)
    })
  })

  assert.equal(result.source, 'kg')
  assert.equal(result.searchProvider, 'kugou-mobile-native')
  assert.equal(result.requestedSource, 'kg')
  assert.equal(result.list.length, 1)
  assert.equal(result.list[0].source, 'kg')
  assert.equal(result.list[0].id, '778899')
  assert.equal(result.list[0].hash, 'ABCDEF0123456789ABCDEF0123456789')
  assert.match(decodeURIComponent(h2.calls[0].xhrUrl), /songsearch\.kugou\.com\/song_search_v2/)
  assert.match(decodeURIComponent(h2.calls[1].xhrUrl), /mobilecdn\.kugou\.com\/api\/v3\/search\/song/)
}


console.log('PASS: LX search routing stays channel-bound and never mixes providers')
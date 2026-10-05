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
    btoa(value) {
      return Buffer.from(String(value), 'latin1').toString('base64')
    },
    LXLegacySHA1() {
      return '0123456789abcdef0123456789abcdef0123456789'
    },
    setTimeout,
    clearTimeout,
    XMLHttpRequest: FakeXHR,
    createLXRuntime() {
      return {
        utils: {
          crypto: {
            md5() {
              return '0123456789abcdef0123456789abcdefdeadbeef'
            },
            aesEncrypt() {
              return {
                toString(format) {
                  return format === 'hex' ? '00'.repeat(16) : ''
                }
              }
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
  assert.equal(result.list[0].types.map(item => item.type).join('|'), '128k|flac')

  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].xhrMethod, 'GET')
  assert.equal(h.calls[0].xhrBody, null)
  const kuwoProxyRequest = new URL(h.calls[0].xhrUrl)
  const kuwoUrl = kuwoProxyRequest.searchParams.get('url')
  assert.ok(kuwoUrl, 'Kuwo request must expose nested target URL')
  assert.match(kuwoUrl, /search\.kuwo\.cn\/r\.s/)
  assert.equal(new URL(kuwoUrl).searchParams.get('all'), '周杰伦')
  assert.equal(new URL(kuwoUrl).searchParams.get('pn'), '0')
  assert.equal(new URL(kuwoUrl).searchParams.get('rn'), '20')
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



{
  const h = createHarness(
    {
      kw: { actions: ['musicUrl'] },
      kg: { actions: ['musicUrl'] },
      tx: { actions: ['musicUrl'] },
      wy: { actions: ['musicUrl'] },
      mg: { actions: ['musicUrl'] }
    },
    () => {},
    {
      search: [
        {
          status: 200,
          body: JSON.stringify({
            code: 0,
            url: 'https://cdn.example.test/kw-audio.mp3',
            br: 128,
            size: 1234
          })
        },
        {
          status: 200,
          body: JSON.stringify({
            status: 1,
            bitRate: 320,
            url: ['https://audio.example.test/kg-tracker.mp3']
          })
        },
        {
          status: 200,
          body: JSON.stringify({
            code: 0,
            url: 'https://cdn.example.test/tx-audio.mp3',
            br: 128,
            size: 1234
          })
        },
        {
          status: 200,
          body: JSON.stringify({
            code: 0,
            url: 'https://cdn.example.test/wy-audio.mp3',
            br: 128,
            size: 1234
          })
        },
        {
          status: 200,
          body: JSON.stringify({
            code: 0,
            url: 'https://cdn.example.test/mg-audio.mp3',
            br: 128,
            size: 1234
          })
        }
      ]
    }
  )

  const cases = [
    { source: 'kw', info: { songmid: '62355680' }, quality: '128k', id: '62355680', huibqQuality: '128k' },
    { source: 'kg', info: { songmid: '778899', hash: 'ABCDEF0123456789' }, quality: '320k', id: 'ABCDEF0123456789', huibqQuality: '320k' },
    { source: 'wy', info: { songmid: '99887766' }, quality: '192k', id: '99887766', huibqQuality: '128k' },
    { source: 'mg', info: { copyrightId: '55667788', songmid: 'mg-song-55667788' }, quality: 'flac24bit', id: 'mg-song-55667788', huibqQuality: '320k' }
  ]

  for (const item of cases) {
    const result = await new Promise((resolve, reject) => {
      h.sandbox.LXMusicSearch.resolveMusicUrl(
        item.source,
        item.info,
        item.quality,
        (err, value) => err ? reject(err) : resolve(value),
        item.source === 'tx' ? { skipProvider: 'gd-studio' } : undefined
      )
    })

    if (item.source === 'kg') {
      assert.equal(result.provider, 'kugou-native')
      assert.equal(result.url, 'https://audio.example.test/kg-tracker.mp3')
      assert.equal(result.id, 'abcdef0123456789')
      const kgCalls = h.calls.filter(call => call.xhrMethod === 'GET' && String(call.xhrUrl || '').includes('tracker.kugou.com'))
      assert.equal(kgCalls.length, 1)
      const target = new URL(kgCalls[0].xhrUrl).searchParams.get('url')
      assert.match(target, /tracker\.kugou\.com\/v5\/url/)
      assert.equal(new URL(target).searchParams.get('hash'), 'abcdef0123456789')
      assert.equal(new URL(target).searchParams.get('quality'), '320')

    } else {
      assert.equal(result.provider, 'huibq')
      assert.equal(result.url, 'https://cdn.example.test/' + item.source + '-audio.mp3')
      assert.equal(result.id, item.id)

      const call = h.calls[h.calls.length - 1]
      const target = new URL(call.xhrUrl).searchParams.get('url')
      const requestUrl = new URL(target)
      assert.equal(requestUrl.origin, 'https://lxmusicapi.onrender.com')
      assert.equal(requestUrl.pathname, '/url/' + item.source + '/' + item.id + '/' + item.huibqQuality)
      const forwarded = JSON.parse(call.xhrHeaders['X-LX-Headers'])
      assert.equal(forwarded['X-Request-Key'], 'share-v3')
    }
  }
}


{
  const h = createHarness(
    {
      kg: { actions: ['musicUrl'] }
    },
    () => {},
    {
      time: { status: 500, body: 'must not be used' },
      search: [
        { status: 502, body: 'initial v5 unavailable' },
        {
          status: 200,
          body: JSON.stringify({
            data: [[
              {
                album_info: { album_id: '939265' },
                album_audio_id: '7788'
              }
            ]]
          })
        },
        {
          status: 200,
          body: JSON.stringify({
            url: ['https://audio.example.test/kg-v5-after-meta.mp3'],
            br: 128
          })
        }
      ]
    }
  )

  const result = await new Promise((resolve, reject) => {
    h.sandbox.LXMusicSearch.resolveMusicUrl(
      'kg',
      {
        hash: 'ABCDEF0123456789',
        albumId: '939265',
        albumAudioId: '0'
      },
      '128k',
      (err, value) => err ? reject(err) : resolve(value)
    )
  })

  assert.equal(result.provider, 'kugou-native')
  assert.equal(result.resolver, 'kugou-v5')
  assert.equal(result.url, 'https://audio.example.test/kg-v5-after-meta.mp3')
  assert.equal(h.calls.length, 3)

  const firstTarget = new URL(h.calls[0].xhrUrl).searchParams.get('url')
  assert.match(firstTarget, /tracker\.kugou\.com\/v5\/url/)
  assert.equal(new URL(firstTarget).searchParams.get('hash'), 'abcdef0123456789')

  const metadataTarget = new URL(h.calls[1].xhrUrl).searchParams.get('url')
  assert.match(metadataTarget, /gateway\.kugou\.com\/v3\/album_audio\/audio/)

  const retryTarget = new URL(h.calls[2].xhrUrl).searchParams.get('url')
  assert.match(retryTarget, /tracker\.kugou\.com\/v5\/url/)
  assert.equal(new URL(retryTarget).searchParams.get('hash'), 'abcdef0123456789')
  assert.equal(new URL(retryTarget).searchParams.get('album_id'), '939265')
  assert.equal(new URL(retryTarget).searchParams.get('album_audio_id'), '7788')
}

{
  const h = createHarness(
    { kg: { actions: ['musicUrl'] } },
    () => {},
    {
      time: { status: 500, body: 'must not be used' },
      search: {
        status: 200,
        body: JSON.stringify({
          url: ['https://audio.example.test/kg-gateway.mp3'],
          br: 128
        })
      }
    }
  )

  const result = await new Promise((resolve, reject) => {
    h.sandbox.LXMusicSearch.resolveMusicUrl(
      'kg',
      { hash: 'ABCDEF0123456789', albumId: '939265', albumAudioId: '0' },
      '128k',
      (err, value) => err ? reject(err) : resolve(value)
    )
  })

  assert.equal(result.provider, 'kugou-native')
  assert.equal(result.url, 'https://audio.example.test/kg-gateway.mp3')
  assert.equal(result.id, 'abcdef0123456789')
  assert.equal(h.calls.length, 1)
  const v5Target = new URL(h.calls[0].xhrUrl).searchParams.get('url')
  assert.match(v5Target, /tracker\.kugou\.com\/v5\/url/)
  assert.equal(new URL(v5Target).searchParams.get('hash'), 'abcdef0123456789')
  assert.equal(new URL(v5Target).searchParams.get('quality'), '128')
  const forwarded = JSON.parse(h.calls[0].xhrHeaders['X-LX-Headers'])
  assert.equal(forwarded['KG-THash'], '255d751')
  assert.equal(forwarded['KG-RC'], '1')
}

{
  const cases = [
    {
      source: 'wy',
      expectedProvider: 'netease-native',
      response: {
        result: {
          songCount: 1,
          songs: [{
            id: 2001,
            name: '晴天',
            duration: 269000,
            artists: [{ name: '周杰伦', id: 1 }],
            album: { id: 2, name: '叶惠美', picUrl: 'https://img.example/2.jpg' }
          }]
        }
      }
    },
    {
      source: 'mg',
      expectedProvider: 'migu-native',
      response: {
        code: '000000',
        songResultData: {
          totalCount: '1',
          resultList: [[{
            songId: 'mg-song-1',
            copyrightId: 'mg-copy-1',
            name: '晴天',
            album: '叶惠美',
            albumId: 'mg-alb',
            duration: '269',
            singerList: [{ name: '周杰伦' }],
            audioFormats: [
              { formatType: 'PQ', asize: 1000000 },
              { formatType: 'HQ', asize: 2000000 },
              { formatType: 'SQ', asize: 4000000 },
              { formatType: 'ZQ24', asize: 8000000 }
            ]
          }]]
        }
      }
    }
  ]

  for (const item of cases) {
    const h = createHarness(
      {
        [item.source]: { actions: ['musicUrl'] }
      },
      () => {},
      { search: { status: 200, body: JSON.stringify(item.response) } }
    )

    const result = await new Promise((resolve, reject) => {
      h.sandbox.LXMusicSearch.search(item.source, '周杰伦', 1, 20, (err, value) => {
        if (err) reject(err)
        else resolve(value)
      })
    })

    assert.equal(result.source, item.source)
    assert.equal(result.searchProvider, item.expectedProvider)
    assert.equal(result.requestedSource, item.source)
    assert.equal(result.list.length, 1)
    assert.equal(result.list[0].source, item.source)

    if (item.source === 'wy') {
      assert.equal(result.list[0].songmid, '2001')
      assert.equal(result.list[0].singer, '周杰伦')
      assert.equal(h.calls[0].xhrMethod, 'POST')
      const requestUrl = new URL(h.calls[0].xhrUrl)
      const target = new URL(requestUrl.searchParams.get('url'))
      assert.match(target.pathname, /\/api\/cloudsearch\/pc$/)
      assert.match(decodeURIComponent(h.calls[0].xhrBody || ''), /type=1/)
      assert.match(decodeURIComponent(h.calls[0].xhrBody || ''), /offset=0/)
    }
    if (item.source === 'mg') {
      assert.equal(result.list[0].copyrightId, 'mg-copy-1')
      assert.equal(result.list[0].songmid, 'mg-song-1')
      assert.equal(result.list[0].singer, '周杰伦')
      assert.equal(h.calls[0].xhrMethod, 'GET')
    }
  }
}

{
  const h = createHarness(
    {
      wy: { actions: ['musicUrl'] }
    },
    () => {},
    {
      search: [
        {
          status: 200,
          body: JSON.stringify({ result: { songCount: 0, songs: [] } })
        },
        {
          status: 200,
          body: JSON.stringify([
            { id: 'wy-good', name: '晴天', artist: '周杰伦', source: 'netease', songmid: 'wy-good' },
            { id: 'tx-bad', name: '晴天', artist: '周杰伦', source: 'tencent', songmid: 'tx-bad' }
          ])
        }
      ]
    }
  )

  const result = await new Promise((resolve, reject) => {
    h.sandbox.LXMusicSearch.search('wy', '周杰伦', 1, 20, (err, value) => {
      if (err) reject(err)
      else resolve(value)
    })
  })

  assert.equal(result.source, 'wy')
  assert.equal(result.searchProvider, 'gdstudio-native')
  assert.equal(result.fallbackSearch, true)
  assert.equal(result.list.length, 1)
  assert.equal(result.list[0].source, 'wy')
  assert.equal(result.list[0].id, 'wy-good')
  assert.match(decodeURIComponent(h.calls[0].xhrUrl), /music\.163\.com\/api\/cloudsearch\/pc/)
  assert.match(decodeURIComponent(h.calls[1].xhrUrl), /music-api\.gdstudio\.xyz\/api\.php/)
  const fallbackTarget = new URL(new URL(h.calls[1].xhrUrl).searchParams.get('url'))
  assert.equal(fallbackTarget.searchParams.get('source'), 'netease')
}

{
  const h = createHarness(
    { kw: { actions: ['musicUrl'] } },
    () => {},
    {
      search: [
        { status: 200, body: JSON.stringify({ code: 1, msg: 'Huibq unavailable' }) },
        { status: 200, body: JSON.stringify({ url: 'https://cdn.example.test/tunehub.mp3', br: '128k' }) }
      ]
    }
  )

  const result = await new Promise((resolve, reject) => {
    h.sandbox.LXMusicSearch.resolveMusicUrl(
      'kw',
      { songmid: '62355680' },
      '128k',
      (err, value) => err ? reject(err) : resolve(value)
    )
  })

  assert.equal(result.provider, 'tune-free')
  assert.equal(result.url, 'https://cdn.example.test/tunehub.mp3')
  assert.equal(result.id, '62355680')
  assert.equal(h.calls.length, 2)
  const target = new URL(h.calls[1].xhrUrl).searchParams.get('url')
  const requestUrl = new URL(target)
  assert.equal(requestUrl.origin, 'https://music-dl.sayqz.com')
  assert.equal(requestUrl.pathname, '/api/')
  assert.equal(requestUrl.searchParams.get('source'), 'kuwo')
  assert.equal(requestUrl.searchParams.get('id'), '62355680')
  assert.equal(requestUrl.searchParams.get('type'), 'url')
  assert.equal(requestUrl.searchParams.get('br'), '128k')
}

{
  const h = createHarness(
    { kg: { actions: ['musicUrl'] } },
    () => {},
    {
      time: { status: 500, body: 'must not be used' },
      search: [
        { status: 200, body: '{}' },
        { status: 200, body: JSON.stringify({ data: [[{ album_info: { album_id: '1802652' }, album_audio_id: '40118502' }]] }) },
        { status: 200, body: '{}' },
        { status: 200, body: '{}' },
        { status: 200, body: '{}' },
        { status: 200, body: '{}' },
        { status: 200, body: '{}' },
        { status: 200, body: '{}' },
        { status: 200, body: JSON.stringify({ code: 200, url: 'https://audio.example.test/kg-aggregate.mp3' }) }
      ]
    }
  )

  const result = await new Promise((resolve, reject) => {
    h.sandbox.LXMusicSearch.resolveMusicUrl(
      'kg',
      {
        hash: 'A06B033B356BFC974C5245D0195086A5',
        songmid: '19863164',
        albumId: '1802652',
        albumAudioId: '40118502'
      },
      '128k',
      (err, value) => err ? reject(err) : resolve(value)
    )
  })

  assert.equal(result.provider, 'kugou-aggregate-haitang')
  assert.equal(result.url, 'https://audio.example.test/kg-aggregate.mp3')
  assert.equal(h.calls.length, 9)
  const aggregateTarget = new URL(h.calls[8].xhrUrl).searchParams.get('url')
  assert.match(aggregateTarget, /musicserver\.haitangw\.cc\/v1\/music\/resolve-url/)
}

{
  const h = createHarness(
    { tx: { actions: ['musicUrl'] } },
    () => {},
    {
      time: { status: 500, body: 'must not be used' },
      search: [
        { status: 200, body: '{}' },
        { status: 200, body: JSON.stringify({ code: 200, url: 'https://audio.example.test/tx-aggregate.mp3' }) }
      ]
    }
  )

  const result = await new Promise((resolve, reject) => {
    h.sandbox.LXMusicSearch.resolveMusicUrl(
      'tx',
      { songmid: '0039MnYb0qxYhV' },
      '128k',
      (err, value) => err ? reject(err) : resolve(value)
    )
  })

  assert.equal(result.provider, 'tencent-aggregate-xinghai')
  assert.equal(result.url, 'https://audio.example.test/tx-aggregate.mp3')
  assert.equal(h.calls.length, 2)
  const target = new URL(h.calls[1].xhrUrl).searchParams.get('url')
  assert.match(target, /yy\.zddyr\.top\/lx\/api/)
  assert.equal(new URL(target).searchParams.get('source'), 'qq')
  assert.equal(new URL(target).searchParams.get('songmid'), '0039MnYb0qxYhV')
  assert.equal(new URL(target).searchParams.get('quality'), '128k')
}

{
  const h = createHarness(
    { tx: { actions: ['musicUrl'] } },
    () => {},
    {
      time: { status: 500, body: 'must not be used' },
      search: [
        {
          status: 200,
          body: JSON.stringify({
            req_0: {
              data: {
                midurlinfo: [{ purl: 'M5000039MnQn.mp3' }],
                sip: ['https://audio.example.test/']
              }
            }
          })
        }
      ]
    }
  )

  const result = await new Promise((resolve, reject) => {
    h.sandbox.LXMusicSearch.resolveMusicUrl(
      'tx',
      { songmid: '0039MnQn' },
      '128k',
      (err, value) => err ? reject(err) : resolve(value)
    )
  })

  assert.equal(result.provider, 'tencent-aggregate-official')
  assert.equal(result.url, 'https://isure.stream.qqmusic.qq.com/M5000039MnQn.mp3')
  assert.equal(h.calls.length, 1)

  const target = new URL(h.calls[0].xhrUrl).searchParams.get('url')
  assert.equal(target, 'https://u.y.qq.com/cgi-bin/musicu.fcg')
  const payload = JSON.parse(h.calls[0].xhrBody)
  assert.equal(payload.req_0.method, 'CgiGetVkey')
  assert.equal(payload.req_0.param.songmid[0], '0039MnQn')
  assert.equal(payload.req_0.param.loginflag, 0)
}

{
  const h = createHarness(
    { tx: { actions: ['musicUrl'] } },
    () => {},
    {
      time: { status: 500, body: 'must not be used' },
      search: [{
        status: 200,
        body: JSON.stringify({
          req_0: {
            data: {
              midurlinfo: [{ purl: 'M5000039MnQn.mp3?guid=123&vkey=abc&uin=0&fromtag=66' }],
              sip: ['http://ws.stream.qqmusic.qq.com/', 'http://isure.stream.qqmusic.qq.com/']
            }
          }
        })
      }]
    }
  )

  const result = await new Promise((resolve, reject) => {
    h.sandbox.LXMusicSearch.resolveMusicUrl(
      'tx',
      { songmid: '0039MnQn' },
      '128k',
      (err, value) => err ? reject(err) : resolve(value)
    )
  })

  assert.equal(result.provider, 'tencent-aggregate-official')
  assert.equal(result.url, 'https://isure.stream.qqmusic.qq.com/M5000039MnQn.mp3?guid=123&vkey=abc&uin=0&fromtag=66')
}

{
  const h = createHarness(
    { tx: { actions: ['musicUrl'] } },
    () => {},
    {
      time: { status: 200, body: '1791180000' },
      search: [{
        status: 200,
        body: JSON.stringify({ url: 'https://media.example.test/tx-gd.mp3', br: 128 })
      }]
    }
  )

  const result = await new Promise((resolve, reject) => {
    h.sandbox.LXMusicSearch.resolveMusicUrl(
      'tx',
      { songmid: '0039MnQn', id: '200790315' },
      '128k',
      (err, value) => err ? reject(err) : resolve(value)
    )
  })

  assert.equal(result.provider, 'gd-studio')
  assert.equal(result.url, 'https://media.example.test/tx-gd.mp3')
  assert.equal(h.calls.length, 2)
  assert.equal(h.calls[0].xhrMethod, 'GET')
  assert.equal(new URL(h.calls[0].xhrUrl).searchParams.get('url'), 'https://music.gdstudio.xyz/time')
  assert.equal(h.calls[1].xhrMethod, 'POST')
  assert.equal(new URL(h.calls[1].xhrUrl).searchParams.get('url'), 'https://music-api.gdstudio.xyz/api.php')
  assert.match(h.calls[1].xhrBody, /types=url/)
  assert.match(h.calls[1].xhrBody, /source=tencent/)
  assert.match(h.calls[1].xhrBody, /id=0039MnQn/)
  assert.match(h.calls[1].xhrBody, /(^|&)s=[A-F0-9]{8}(&|$)/)
}

console.log('PASS: LX search routing stays channel-bound and never mixes providers')
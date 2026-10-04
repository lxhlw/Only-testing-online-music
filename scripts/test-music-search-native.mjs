import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/music-search.js', import.meta.url), 'utf8')

const calls = []
const sandbox = {
  window: null,
  console,
  location: { protocol: 'http:', host: 'legacy.example', href: 'http://legacy.example/' },
  LXSourceManager: {
    getActive() {
      return {
        sources: {
          qsvip: {
            name: '汽水VIP',
            actions: ['musicSearch', 'musicUrl', 'lyric'],
            qualitys: ['128k', '320k']
          }
        }
      }
    },
    requestAction(sourceName, action, info, callback) {
      calls.push({ sourceName, action, info })
      callback(null, {
        isEnd: false,
        total: 1,
        list: [{
          id: 'song-1',
          name: '成都',
          singer: '赵雷',
          albumName: 'demo',
          duration: 245,
          pic: 'https://example.test/cover.jpg'
        }]
      })
    }
  }
}
sandbox.window = sandbox

vm.runInNewContext(source, sandbox, { filename: 'music-search.js' })

await new Promise((resolve, reject) => {
  sandbox.LXMusicSearch.search('qsvip', '成都', 2, 30, (err, result) => {
    if (err) return reject(err)
    assert.equal(result.source, 'qsvip')
    assert.equal(result.page, 2)
    assert.equal(result.total, 1)
    assert.equal(result.list.length, 1)
    assert.equal(result.list[0].id, 'song-1')
    assert.equal(result.list[0].songmid, 'song-1')
    assert.equal(result.list[0].singer, '赵雷')
    resolve()
  })
})

assert.deepEqual(calls, [{
  sourceName: 'qsvip',
  action: 'musicSearch',
  info: { keyword: '成都', page: 2, pagesize: 30 }
}])

console.log('PASS: native LX musicSearch routing')

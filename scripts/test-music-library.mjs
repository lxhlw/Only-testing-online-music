import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/music-library.js', import.meta.url), 'utf8')

function createStorage() {
  const data = {}
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null },
    setItem(key, value) { data[key] = String(value) },
    removeItem(key) { delete data[key] }
  }
}

function createLibrary(storage) {
  const sandbox = {
    window: { localStorage: storage },
    localStorage: storage,
    JSON,
    String,
    Math,
    Object,
    Array,
    console
  }
  vm.runInNewContext(source, sandbox, { filename: 'music-library.js' })
  return sandbox.window.LXMusicLibrary
}

const storage = createStorage()
const library = createLibrary(storage)

const song1 = {
  id: '1',
  name: '成都',
  singer: '赵雷',
  source: 'tx',
  songmid: 'song-1',
  raw: { file: { media_mid: 'song-1' } }
}
const song2 = {
  id: '2',
  name: '成都 2',
  singer: '测试歌手',
  source: 'tx',
  songmid: 'song-2',
  raw: { file: { media_mid: 'song-2' } }
}

const initial = library.snapshot()
assert.deepEqual(Array.from(initial.queue), [])
assert.deepEqual(Array.from(initial.history), [])
assert.deepEqual(Array.from(initial.favorites), [])

assert.equal(library.addQueue(song1), true)
assert.equal(library.addQueue(song1), true)
assert.equal(library.snapshot().queue.length, 1)

assert.equal(library.addQueue(song2), true)
assert.deepEqual(Array.from(library.snapshot().queue.map(item => item.id)), ['1', '2'])

assert.equal(library.isFavorite(song1), false)
assert.equal(library.toggleFavorite(song1), true)
assert.equal(library.isFavorite(song1), true)
assert.equal(library.toggleFavorite(song1), false)
assert.equal(library.isFavorite(song1), false)

assert.equal(library.toggleFavorite(song1), true)
assert.equal(library.addHistory(song1), true)
assert.equal(library.addHistory(song2), true)
assert.deepEqual(Array.from(library.snapshot().history.map(item => item.id)), ['2', '1'])

assert.equal(library.removeQueue(song1), true)
assert.deepEqual(Array.from(library.snapshot().queue.map(item => item.id)), ['2'])

const reloaded = createLibrary(storage)
const restored = reloaded.snapshot()
assert.deepEqual(Array.from(restored.queue.map(item => item.id)), ['2'])
assert.deepEqual(Array.from(restored.history.map(item => item.id)), ['2', '1'])
assert.deepEqual(Array.from(restored.favorites.map(item => item.id)), ['1'])

let changeCount = 0
reloaded.onChange(() => { changeCount += 1 })
reloaded.clearQueue()
assert.equal(changeCount > 0, true)
assert.equal(reloaded.snapshot().queue.length, 0)

console.log('PASS: music library queue/history/favorites persistence')

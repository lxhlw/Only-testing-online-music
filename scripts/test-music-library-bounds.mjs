import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const code = fs.readFileSync(new URL('../src/music-library.js', import.meta.url), 'utf8')
const data = {}
const storage = {
  getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null },
  setItem(key, value) { data[key] = String(value) },
  removeItem(key) { delete data[key] }
}
function library() {
  const window = { localStorage: storage }
  vm.runInNewContext(code, { window, localStorage: storage }, { filename: 'music-library.js' })
  return window.LXMusicLibrary
}
const music = n => ({ id: String(n), name: 'Song ' + n, source: 'wy' })
const api = library()

for (let i = 1; i <= 100; i++) assert.equal(api.addQueue(music(i)), true)
let queue = api.snapshot().queue
assert.equal(queue.length, 100)
assert.equal(queue[0].id, '1')
assert.equal(queue[99].id, '100')
assert.equal(api.addQueue(music(101)), true)
queue = api.snapshot().queue
assert.equal(queue.length, 100)
assert.equal(queue[0].id, '2', 'oldest song should be evicted')
assert.equal(queue[99].id, '101', 'new song must survive')
console.log('PASS: 101st song evicts oldest and remains in queue')

assert.equal(api.addQueue(music(50)), true)
queue = api.snapshot().queue
assert.equal(queue.length, 100)
assert.equal(queue.filter(song => song.id === '50').length, 1, 'no duplicates')
assert.equal(queue[99].id, '50', 'existing song moves to queue end')
assert.equal(queue[0].id, '2', 'moving duplicate must not remove another song')
assert.equal(api.addQueue({ name: 'invalid' }), false)
assert.equal(api.snapshot().queue.length, 100)
console.log('PASS: duplicate re-add and invalid item handling')

const reloaded = library()
queue = reloaded.snapshot().queue
assert.equal(queue.length, 100)
assert.equal(queue[99].id, '50')
assert.equal(queue.filter(song => song.id === '50').length, 1)
assert.equal(reloaded.removeQueue(music(50)), true)
assert.equal(reloaded.snapshot().queue.length, 99)
console.log('PASS: queue order and boundary persist across reload')

for (let i = 1; i <= 51; i++) assert.equal(reloaded.addHistory(music(i)), true)
const history = reloaded.snapshot().history
assert.equal(history.length, 50)
assert.equal(history[0].id, '51')
assert.equal(history[49].id, '2')
console.log('PASS: history continues keeping latest 50 songs')

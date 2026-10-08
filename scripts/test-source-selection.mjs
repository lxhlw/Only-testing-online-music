import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/source-manager.js', import.meta.url), 'utf8')
const SOURCES_KEY = 'only-testing-online-music.lx-sources'
const ACTIVE_KEY = 'only-testing-online-music.active-source-id'
const data = {}
const storage = {
  getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null },
  setItem(key, value) { data[key] = String(value) },
  removeItem(key) { delete data[key] }
}

function createManager() {
  const window = {
    localStorage: storage,
    location: { href: 'https://music.example/', protocol: 'https:', host: 'music.example' },
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 4.4.2)' },
    console,
    setTimeout,
    clearTimeout,
    createLXRuntime: () => ({
      __requestAction() { return Promise.resolve({ url: 'https://music.example/song.mp3' }) }
    }),
    LXSourceTranspiler: {
      prepare(code, url, callback) {
        callback(null, '/* fixture source */', false)
      }
    }
  }
  window.globalThis = window
  const context = { window, localStorage: storage, XMLHttpRequest: function () {}, Date, Math, console, setTimeout, clearTimeout }
  vm.runInNewContext(source, context, { filename: 'source-manager.js' })
  return window.LXSourceManager
}

function install(manager, url, name) {
  let saved = null
  manager.installFromCode('/* @name ' + name + ' */', url, (err, item) => {
    assert.equal(err, null)
    saved = item
  })
  assert.ok(saved, 'install callback must complete')
  return saved
}

const manager = createManager()
manager.init()
assert.equal(manager.getActive(), null)
const first = install(manager, 'https://example.test/source-a.js', 'Source A')
const second = install(manager, 'https://example.test/source-b.js', 'Source B')
assert.equal(manager.getActive().id, second.id, 'new install should be selected')
assert.equal(data[ACTIVE_KEY], second.id)
assert.equal(JSON.parse(data[SOURCES_KEY]).length, 2)
console.log('PASS: install and selected-source persistence')

assert.equal(manager.activate(first.id).id, first.id)
assert.equal(data[ACTIVE_KEY], first.id)
let reloaded = createManager()
reloaded.init()
assert.equal(reloaded.getActive().id, first.id, 'refresh should restore manually activated source')
assert.equal(reloaded.getSources().length, 2)
assert.equal(JSON.parse(data[SOURCES_KEY]).length, 2, 'legacy installed source array remains unchanged')
console.log('PASS: manual selection restored across reload')

assert.equal(reloaded.activate('unknown-id'), null)
assert.equal(data[ACTIVE_KEY], first.id, 'invalid selection must not replace stored choice')
const replacement = install(reloaded, 'https://example.test/source-a.js', 'Source A Updated')
assert.notEqual(replacement.id, first.id)
assert.equal(reloaded.getActive().id, replacement.id)
assert.equal(reloaded.getSources().length, 2)
assert.equal(data[ACTIVE_KEY], replacement.id)
reloaded = createManager()
reloaded.init()
assert.equal(reloaded.getActive().id, replacement.id)
console.log('PASS: replacing an installed source updates the persisted source ID')

assert.equal(reloaded.remove(replacement.id), undefined)
assert.equal(reloaded.getActive().id, second.id, 'deleted selection should fall back')
assert.equal(data[ACTIVE_KEY], second.id)
reloaded = createManager()
reloaded.init()
assert.equal(reloaded.getActive().id, second.id)
console.log('PASS: deleting selected source keeps a valid fallback across reload')

reloaded.clear()
assert.equal(reloaded.getActive(), null)
assert.equal(storage.getItem(ACTIVE_KEY), null)
assert.equal(storage.getItem(SOURCES_KEY), null)
reloaded = createManager()
reloaded.init()
assert.equal(reloaded.getActive(), null)
console.log('PASS: clear removes both installed sources and selected ID')

storage.setItem(SOURCES_KEY, JSON.stringify([
  { id: 'legacy-a', code: '/* @name Legacy A */', url: 'https://legacy.test/a.js' },
  { id: 'legacy-b', code: '/* @name Legacy B */', url: 'https://legacy.test/b.js' }
]))
reloaded = createManager()
reloaded.init()
assert.equal(reloaded.getActive().id, 'legacy-a', 'legacy installs default to first source')
assert.equal(storage.getItem(ACTIVE_KEY), 'legacy-a')
storage.setItem(ACTIVE_KEY, 'no-longer-installed')
reloaded = createManager()
reloaded.init()
assert.equal(reloaded.getActive().id, 'legacy-a', 'stale selection must fall back')
assert.equal(storage.getItem(ACTIVE_KEY), 'legacy-a')
console.log('PASS: legacy storage compatibility and stale ID recovery')

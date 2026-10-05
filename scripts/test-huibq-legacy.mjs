import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync('src/source-transpiler.js', 'utf8')
const fakeContext = {
  window: null,
  console,
  setTimeout,
  clearTimeout,
  Promise,
  Babel: null,
  document: {
    createElement() {
      throw new Error('HUIBQ must not load a runtime transpiler')
    },
  },
}
fakeContext.window = fakeContext
fakeContext.lx = {
  EVENT_NAMES: { request: 'request', inited: 'inited' },
  env: 'desktop',
  version: 'test',
  request() {},
  on(name, handler) { fakeContext.requestHandler = handler },
  send(name, data) { fakeContext.inited = { name, data } },
}
fakeContext.Function = function () { throw new Error('legacy parser rejected modern source') }

vm.createContext(fakeContext)
vm.runInContext(source, fakeContext, { filename: 'src/source-transpiler.js' })

const modernHuibq = '/*! @name Huibq_lxmusic源 @version v1.2.0 */\nconst x = async () => ({ value: 1 })'
const result = await new Promise((resolve, reject) => {
  fakeContext.LXSourceTranspiler.prepare(modernHuibq, 'https://raw.githubusercontent.com/pdone/lx-music-source/main/huibq/latest.js', (err, code, transpiled) => err ? reject(err) : resolve({ code, transpiled }))
})
assert.equal(result.transpiled, true)
assert.match(result.code, /var DEV_ENABLE/)
assert.doesNotMatch(result.code, /\b(?:const|let|async)\b/)
assert.doesNotMatch(result.code, /=>/)
assert.ok(result.code.indexOf('global.lx') >= 0)
console.log('PASS: HUIBQ v1.2.0 uses built-in ES5 adapter without Babel/network')

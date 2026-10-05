import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync('src/source-transpiler.js', 'utf8')
const requestedScripts = []

const fakeContext = {
  window: null,
  location: { protocol: 'https:', host: 'example.test', origin: 'https://example.test' },
  console,
  setTimeout,
  clearTimeout,
  Babel: null,
  document: {
    createElement(type) {
      assert.equal(type, 'script')
      return {
        type: '',
        async: true,
        src: '',
        parentNode: null,
        onload: null,
        onerror: null,
        onreadystatechange: null,
      }
    },
    getElementsByTagName() {
      return [{
        appendChild(script) {
          requestedScripts.push(script.src)
          script.parentNode = this
          fakeContext.Babel = {
            transform(code) {
              return { code: '/* transformed */\n' + code }
            },
          }
          script.readyState = 'complete'
          if (typeof script.onload === 'function') script.onload()
        },
      }]
    },
    documentElement: null,
  },
}

fakeContext.window = fakeContext

// Simulate an Android 4.4 parser that cannot parse modern source syntax.
fakeContext.Function = function () {
  throw new Error('legacy parser rejected source')
}

vm.createContext(fakeContext)
vm.runInContext(source, fakeContext, { filename: 'src/source-transpiler.js' })

const modernSource = 'const answer = async () => ({ value: 1 })'
const result = await new Promise((resolve, reject) => {
  fakeContext.LXSourceTranspiler.prepare(modernSource, 'huibq/latest.js', (err, code, transpiled) => {
    if (err) reject(err)
    else resolve({ code, transpiled })
  })
})

assert.equal(requestedScripts.length, 1)
assert.equal(requestedScripts[0], '/api/babel')
assert.equal(result.transpiled, true)
assert.match(result.code, /transformed/)

console.log('PASS: legacy transpiler prefers same-origin Babel before external CDN')

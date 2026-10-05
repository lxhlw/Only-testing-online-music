import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync('src/source-transpiler.js', 'utf8')
const requestedXhrs = []
const insertedScripts = []

const fakeContext = {
  window: null,
  location: { protocol: 'https:', host: 'example.test', origin: 'https://example.test' },
  console,
  setTimeout,
  clearTimeout,
  Babel: null,
  XMLHttpRequest: function () {
    this.readyState = 0
    this.status = 200
    this.responseText = '/* fake Babel bundle */'
    this.open = (method, url) => {
      assert.equal(method, 'GET')
      requestedXhrs.push(url)
    }
    this.abort = () => {}
    this.send = () => {
      this.readyState = 4
      if (typeof this.onreadystatechange === 'function') this.onreadystatechange()
    }
  },
  document: {
    createElement(type) {
      assert.equal(type, 'script')
      return {
        type: '',
        async: false,
        src: '',
        text: '',
        parentNode: null,
        appendChild() {},
      }
    },
    createTextNode(text) {
      return { text }
    },
    getElementsByTagName() {
      return [{
        appendChild(script) {
          insertedScripts.push(script)
          script.parentNode = this
          fakeContext.Babel = {
            transform(code) {
              return { code: '/* transformed */\\n' + code }
            },
          }
        },
        removeChild(script) {
          if (script) script.parentNode = null
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

assert.equal(requestedXhrs.length, 1)
assert.equal(requestedXhrs[0], '/api/babel')
assert.equal(insertedScripts.length, 1)
assert.equal(result.transpiled, true)
assert.match(result.code, /transformed/)

console.log('PASS: legacy transpiler loads same-origin Babel through XHR and executes it inline')

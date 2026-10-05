import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync('src/source-transpiler.js', 'utf8')
const fakeContext = {
  window: null,
  console,
  setTimeout,
  clearTimeout,
  Babel: {
    transform(code) {
      return { code: '/* transformed */\\n' + code }
    },
  },
  XMLHttpRequest() {
    throw new Error('XHR must not be used when bundled Babel is preloaded')
  },
  document: {
    createElement() {
      throw new Error('Dynamic script loading must not be used when bundled Babel is preloaded')
    },
  },
}
fakeContext.window = fakeContext
fakeContext.Function = function () { throw new Error('legacy parser rejected source') }

vm.createContext(fakeContext)
vm.runInContext(source, fakeContext, { filename: 'src/source-transpiler.js' })

const result = await new Promise((resolve, reject) => {
  fakeContext.LXSourceTranspiler.prepare(
    'const answer = async () => ({ value: 1 })',
    'huibq/latest.js',
    (err, code, transpiled) => err ? reject(err) : resolve({ code, transpiled })
  )
})
assert.equal(result.transpiled, true)
assert.match(result.code, /transformed/)
console.log('PASS: legacy transpiler uses preloaded bundled Babel without network access')

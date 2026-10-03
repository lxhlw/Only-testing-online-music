import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import crypto from 'node:crypto'

const SOURCE_URL = 'https://raw.githubusercontent.com/pdone/lx-music-source/main/sixyin/latest.js'
const sourceResponse = await fetch(SOURCE_URL)
assert.equal(sourceResponse.ok, true, 'SixYin source fetch failed: ' + sourceResponse.status)
const sourceCode = await sourceResponse.text()
assert.ok(sourceCode.length > 100000, 'SixYin source is unexpectedly small')

const forgeCode = await fs.readFile('vendor/forge.min.js', 'utf8')
const runtimeCode = await fs.readFile('src/lx-runtime.js', 'utf8')

const requests = []
let inited = false
let initData = null

const context = {
  console,
  Promise,
  Uint8Array,
  ArrayBuffer,
  URL,
  setTimeout,
  clearTimeout,
  TextEncoder,
  TextDecoder,
  atob: globalThis.atob,
  btoa: globalThis.btoa,
  crypto: crypto.webcrypto,
  location: new URL('https://example.test/'),
}
context.window = context
context.self = context
context.globalThis = context
vm.createContext(context)

vm.runInContext(forgeCode, context, { filename: 'vendor/forge.min.js' })
vm.runInContext(runtimeCode, context, { filename: 'src/lx-runtime.js' })

const runtime = context.createLXRuntime({
  env: 'web',
  onInited(data) {
    inited = true
    initData = data
  }
})

async function nodeRequest(url, options, callback) {
  const opts = options || {}
  const method = String(opts.method || 'GET').toUpperCase()
  const headers = new Headers()

  if (opts.headers && typeof opts.headers === 'object') {
    for (const [key, value] of Object.entries(opts.headers)) {
      try { headers.set(key, String(value)) } catch {}
    }
  }

  let body
  if (opts.form && typeof opts.form === 'object') {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(opts.form)) params.set(key, String(value))
    body = params.toString()
    if (!headers.has('content-type')) headers.set('content-type', 'application/x-www-form-urlencoded')
  } else if (opts.body != null) {
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
  }

  requests.push({ url: String(url), method })

  try {
    const response = await fetch(String(url), {
      method,
      headers,
      body,
      redirect: 'follow',
    })
    const text = await response.text()
    callback(null, {
      statusCode: response.status,
      statusMessage: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      bytes: text.length,
      raw: text,
      body: text,
    }, text)
  } catch (error) {
    callback(error, null, null)
  }
}

runtime.request = nodeRequest
runtime.currentScriptInfo = {
  name: 'SixYin',
  version: '1.2.1',
  homepage: 'https://www.sixyin.com',
  rawScript: sourceCode,
}

context.lx = runtime
context.globalThis.lx = runtime

try {
  vm.runInContext(sourceCode, context, { filename: 'sixyin-latest.js', timeout: 20000 })
} catch (error) {
  console.error('SixYin execution error:', error && error.name, error && error.message)
  console.error('Stack:', error && error.stack ? String(error.stack).slice(-3000) : 'none')
  throw error
}

await new Promise(resolve => setTimeout(resolve, 8000))

assert.equal(inited, true, 'SixYin did not send LX inited')
assert.ok(requests.length > 0, 'SixYin made no LX requests')

const requestHandlerCount = runtime.__requestAction ? 1 : 0
assert.equal(requestHandlerCount, 1, 'LX request action bridge is missing')

console.log('PASS: original SixYin latest.js executed in the browser LX Runtime')
console.log('Source bytes:', sourceCode.length)
console.log('Init:', inited)
console.log('LX requests:', requests.length)
console.log('Init keys:', initData && typeof initData === 'object' ? Object.keys(initData).join(',') : 'none')
console.log('First request:', requests[0].method, requests[0].url)

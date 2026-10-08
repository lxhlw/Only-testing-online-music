import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const raw = fs.readFileSync(new URL('../functions/api/proxy.js', import.meta.url), 'utf8')
const source = raw
  .replace(/^import \{ connect \} from 'cloudflare:sockets';\s*/m, '')
  .replace(/export async function /g, 'async function ')
const calls = []
let handler = async () => new Response('OK', { status: 200 })
const sandbox = {
  Request, Response, Headers, URL, Uint8Array, TextEncoder, TextDecoder,
  Promise, JSON, Object, Array, Number, String, Math, console, setTimeout, clearTimeout,
  fetch: async (url, options) => {
    calls.push({ url: String(url), headers: Object.fromEntries(new Headers(options?.headers).entries()), method: options?.method, redirect: options?.redirect })
    return await handler(String(url), options)
  },
  connect() { throw new Error('Unexpected TCP socket connection in proxy security tests') }
}
vm.runInNewContext(source + '\n;globalThis.proxyUnderTest = { onRequest, onRequestOptions, fetchFlowerResolverViaHttpBridge, fetchFlowerResolverViaHost, validateProxyTarget, isPrivateHost };', sandbox)
const api = sandbox.proxyUnderTest
const site = 'https://music.example.test'

function request(url, { origin, siteHeader, method = 'GET', headers = {}, ...extra } = {}) {
  const allHeaders = new Headers(headers)
  if (origin !== undefined) allHeaders.set('Origin', origin)
  if (siteHeader !== undefined) allHeaders.set('Sec-Fetch-Site', siteHeader)
  return new Request(site + '/api/proxy?url=' + encodeURIComponent(url), {
    method, headers: allHeaders, ...extra
  })
}
async function proxy(url, options) { return await api.onRequest({ request: request(url, options) }) }
function reset(next) { calls.length = 0; handler = next }

reset(async () => new Response('{"ok":true}', {
  status: 200, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Set-Cookie': 'session=steal-me; Path=/',
    'Access-Control-Allow-Origin': '*',
    'WWW-Authenticate': 'Basic realm="upstream"'
  }
}))
let res = await proxy('https://api.music.example.test/search?q=chengdu', { siteHeader: 'same-origin' })
assert.equal(res.status, 200)
assert.equal(await res.text(), '{"ok":true}')
assert.equal(res.headers.get('Access-Control-Allow-Origin'), site)
assert.equal(res.headers.get('Set-Cookie'), null)
assert.equal(res.headers.get('WWW-Authenticate'), null)
assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff')
assert.equal(res.headers.get('Content-Type'), 'application/json; charset=utf-8')
assert.equal(calls[0].redirect, 'manual')
console.log('PASS: normal same-origin JSON response, restricted CORS, no upstream cookies')

reset(async () => new Response('{"code":0,"url":"https://media.example.test/audio.mp3"}', {
  status: 200, headers: { 'Content-Type': 'application/json' }
}))
res = await proxy('https://api.music.example.test/url/mg/song-id/128k', {
  siteHeader: 'same-origin',
  headers: {
    'User-Agent': 'Mozilla/5.0 Browser Test Agent',
    'X-LX-Headers': JSON.stringify({
      'User-Agent': 'lx-music-desktop/2.0.0',
      'X-Request-Key': 'test-fixture-key',
      Accept: 'application/json'
    })
  }
})
assert.equal(res.status, 200)
assert.equal(calls[0].headers['user-agent'], 'lx-music-desktop/2.0.0',
  'Must not clobber the custom LX source User-Agent with browser UA')
assert.equal(calls[0].headers['x-request-key'], 'test-fixture-key')
assert.equal(calls[0].headers.accept, 'application/json')
console.log('PASS: imported LX source request headers survive browser proxy forwarding')

reset(async () => new Response('{"code":0}', { status: 200 }))
res = await proxy('https://api.music.example.test/url/mg/another-song/128k', {
  headers: { 'User-Agent': 'Mozilla/5.0 Browser Fallback Agent' }
})
assert.equal(res.status, 200)
assert.equal(calls[0].headers['user-agent'], 'Mozilla/5.0 Browser Fallback Agent',
  'Normal browser User-Agent still applies when the source did not request one')
console.log('PASS: browser header fallback preserved for sources without custom headers')


for (const browserOptions of [
  { origin: 'https://evil.example.test' },
  { origin: 'null' },
  { siteHeader: 'cross-site' },
  { siteHeader: 'same-site' }
]) {
  calls.length = 0
  res = await proxy('https://api.music.example.test/search', browserOptions)
  assert.equal(res.status, 403)
  assert.equal(calls.length, 0, 'external browser request must never call upstream')
}
res = await api.onRequestOptions({ request: request('https://api.music.example.test/search', { origin: 'https://evil.example.test', method: 'OPTIONS' }) })
assert.equal(res.status, 403)
res = await api.onRequestOptions({ request: request('https://api.music.example.test/search', { origin: site, method: 'OPTIONS' }) })
assert.equal(res.status, 204)
assert.equal(res.headers.get('Access-Control-Allow-Origin'), site)
console.log('PASS: cross-origin browser calls and preflight are blocked without breaking same origin')

for (const unsafe of [
  'http://127.0.0.1/admin', 'http://127.1/admin', 'http://10.0.0.2/admin',
  'http://169.254.169.254/latest/meta-data/', 'http://100.100.100.200/metadata',
  'http://192.168.1.1/', 'http://100.64.0.1/', 'http://198.18.0.1/',
  'http://0.0.0.0/', 'http://224.0.0.1/', 'http://example.local/path',
  'http://localhost./admin', 'http://metadata.google.internal/',
  'http://[::1]/', 'http://[::ffff:127.0.0.1]/',
  'https://music.example.test:8443/admin',
  'https://user:pass@music.example.test/admin'
]) {
  calls.length = 0
  res = await proxy(unsafe)
  assert.equal(res.status, 403, 'unsafe initial target ' + unsafe)
  assert.equal(calls.length, 0, 'must not fetch unsafe initial target')
}
console.log('PASS: metadata, loopback, shared ranges, IPv6 mapping, credentials and port block')

reset(async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/admin' } }))
res = await proxy('https://api.music.example.test/redirect')
assert.equal(res.status, 502)
assert.equal(calls.length, 1)
assert.match(await res.text(), /Blocked unsafe upstream redirect target/)
console.log('PASS: redirects to loopback blocked before the second fetch')

reset(async (url) => {
  if (url === 'https://api.music.example.test/redirect') {
    return new Response(null, { status: 302, headers: { Location: 'https://cdn.music.example.test/audio' } })
  }
  return new Response('music bytes', {
    status: 206, headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 0-10/100' }
  })
})
res = await proxy('https://api.music.example.test/redirect', {
  headers: {
    Range: 'bytes=0-10',
    'X-LX-Headers': JSON.stringify({
      Authorization: 'Bearer sensitive-token',
      'X-Request-Key': 'my-api-key',
      Referer: 'https://api.music.example.test/'
    })
  }
})
assert.equal(res.status, 206)
assert.equal(res.headers.get('content-type'), 'audio/mpeg')
assert.equal(res.headers.get('content-range'), 'bytes 0-10/100')
assert.equal(await res.text(), 'music bytes')
assert.equal(calls.length, 2)
assert.equal(calls[0].headers.authorization, 'Bearer sensitive-token')
assert.equal(calls[1].headers.authorization, undefined)
assert.equal(calls[1].headers['x-request-key'], undefined)
assert.equal(calls[1].headers.referer, undefined)
assert.equal(calls[1].headers.range, 'bytes=0-10')
assert.ok(calls.every(x => x.redirect === 'manual'))
console.log('PASS: public redirect streams audio, retains range and strips credentials on host change')

for (const contentType of ['text/html', 'application/javascript', 'image/svg+xml', 'application/xhtml+xml']) {
  reset(async () => new Response('<script>alert(1)</script>', { status: 200, headers: { 'Content-Type': contentType } }))
  res = await proxy('https://api.music.example.test/content')
  assert.match(res.headers.get('content-type') || '', /text\/plain/i)
  assert.equal(res.headers.get('content-disposition'), 'attachment')
  assert.equal(res.headers.get('content-security-policy'), 'sandbox')
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
}
console.log('PASS: browser-executable upstream responses are downgraded to download-only text')

reset(async (url, options) => {
  if (url.startsWith('http://ts.tempmusic.tk/')) {
    assert.equal(new Headers(options.headers).get('authorization'), null)
    assert.equal(new Headers(options.headers).get('x-request-key'), null)
    return new Response('{"url":"https://media.example.test/audio.mp3"}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  throw new Error('Unexpected resolver ' + url)
})
const flowerRequest = request('http://97.64.37.235/flower/v1/url/song', {
  headers: { 'X-LX-Headers': JSON.stringify({ Authorization: 'Bearer private', 'X-Request-Key': 'secret' }) }
})
res = await api.fetchFlowerResolverViaHost(new URL('http://97.64.37.235/flower/v1/url/song'), flowerRequest)
assert.equal(res.status, 200)
assert.ok(calls.some(x => x.url.startsWith('http://ts.tempmusic.tk/')))
console.log('PASS: Flower fallback aliases do not receive source credentials')

reset(async (url, options) => {
  assert.equal(new Headers(options.headers).get('authorization'), null)
  assert.equal(new Headers(options.headers).get('x-request-key'), null)
  if (url.startsWith('https://cors.io/')) {
    return new Response('{"url":"https://media.example.test/audio.mp3"}', { status: 200 })
  }
  throw new Error('Unexpected bridge ' + url)
})
res = await api.fetchFlowerResolverViaHttpBridge(new URL('http://97.64.37.235/flower/v1/url/song'), flowerRequest)
assert.equal(res.status, 200)
assert.ok(calls.some(x => x.url.startsWith('https://cors.io/')))
console.log('PASS: public Flower bridges do not receive caller credentials in headers')

console.log('PASS: proxy security regression suite')

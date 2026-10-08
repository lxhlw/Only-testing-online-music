import assert from 'node:assert/strict'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const endpoint = new URL('/api/proxy', base)
const make = (target) => {
  const url = new URL(endpoint)
  url.searchParams.set('url', target)
  return url.toString()
}

let response = await fetch(make('https://api.music.example.test/search'), {
  headers: { Origin: 'https://untrusted.example.test' }
})
assert.equal(response.status, 403, 'cross-origin browser calls must be blocked')
console.log('PASS: cross-origin Origin is rejected by actual Pages runtime')

response = await fetch(make('http://169.254.169.254/latest/meta-data/'))
assert.equal(response.status, 403, 'cloud metadata targets must never be fetched')
console.log('PASS: metadata URL is rejected by actual Pages runtime')

response = await fetch(make('https://user:pass@api.music.example.test/search'))
assert.equal(response.status, 403, 'URLs with embedded credentials must be rejected')
console.log('PASS: credential-bearing target is rejected by actual Pages runtime')

response = await fetch(make('http://127.0.0.1:8000/private'))
assert.equal(response.status, 403, 'local services must never be proxied')
console.log('PASS: local service is rejected by actual Pages runtime')

response = await fetch(make('https://api.music.example.test/search'), {
  method: 'OPTIONS',
  headers: { Origin: 'https://untrusted.example.test', 'Access-Control-Request-Method': 'GET' }
})
assert.equal(response.status, 403)
assert.notEqual(response.headers.get('access-control-allow-origin'), 'https://untrusted.example.test')
console.log('PASS: cross-origin CORS preflight is denied by actual Pages runtime')

response = await fetch(make('https://api.music.example.test/search'), {
  method: 'OPTIONS',
  headers: { Origin: new URL(base).origin, 'Access-Control-Request-Method': 'GET' }
})
assert.equal(response.status, 204)
assert.equal(response.headers.get('access-control-allow-origin'), new URL(base).origin)
console.log('PASS: same-origin CORS preflight remains supported')
